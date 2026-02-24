-- Migration: 159_publications_schema.sql
-- Publications, Insights & Research CMS Platform
-- Supports: Market Flash, Data Brief, MarketBeat, Research Report, Special Report,
--           Annual Flagship, Policy Paper, Podcast, Index Update, Press Release
BEGIN;

-- ============================================================
-- PUBLICATIONS: Core content table
-- ============================================================
CREATE TABLE IF NOT EXISTS publications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  subtitle TEXT,
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'market_flash', 'data_brief', 'marketbeat', 'research_report',
    'special_report', 'annual_flagship', 'policy_paper', 'podcast',
    'video', 'index_update', 'webinar', 'press_release'
  )),
  status VARCHAR(30) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'ai_draft', 'under_review', 'approved', 'published', 'archived'
  )),

  -- Content
  content_json JSONB DEFAULT '[]'::jsonb,    -- Structured content blocks
  content_html TEXT,                          -- Rendered HTML
  excerpt TEXT,                               -- 200-char summary
  key_findings JSONB DEFAULT '[]'::jsonb,    -- Array of bullet findings

  -- Media
  cover_image_url TEXT,
  pdf_url TEXT,

  -- Taxonomy (stored as arrays for fast filtering)
  sectors TEXT[] DEFAULT '{}',               -- residential_sales, office, retail, etc.
  topics TEXT[] DEFAULT '{}',                -- economics_policy, investment, affordability, etc.
  regions TEXT[] DEFAULT '{}',               -- greater_accra, ashanti, western, national, etc.

  -- Metadata
  author_id UUID,
  author_name VARCHAR(255),
  author_title VARCHAR(255),
  reviewer_id UUID,
  reading_time_minutes INT DEFAULT 0,
  word_count INT DEFAULT 0,

  -- AI tracking
  ai_generated BOOLEAN DEFAULT false,
  ai_model VARCHAR(50),
  ai_prompt_template VARCHAR(100),
  ai_confidence_score DECIMAL(3,2),
  human_edit_percentage DECIMAL(5,2),

  -- SEO
  seo_title VARCHAR(70),
  seo_description VARCHAR(160),
  og_image_url TEXT,
  canonical_url TEXT,

  -- Access control
  access_tier VARCHAR(30) DEFAULT 'public' CHECK (access_tier IN (
    'public', 'registered', 'professional', 'enterprise'
  )),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  scheduled_publish_at TIMESTAMPTZ
);

-- Indexes for publication queries
CREATE INDEX IF NOT EXISTS idx_publications_slug ON publications(slug);
CREATE INDEX IF NOT EXISTS idx_publications_type ON publications(type);
CREATE INDEX IF NOT EXISTS idx_publications_status ON publications(status);
CREATE INDEX IF NOT EXISTS idx_publications_published_at ON publications(published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_publications_sectors ON publications USING GIN(sectors);
CREATE INDEX IF NOT EXISTS idx_publications_topics ON publications USING GIN(topics);
CREATE INDEX IF NOT EXISTS idx_publications_regions ON publications USING GIN(regions);
CREATE INDEX IF NOT EXISTS idx_publications_access_tier ON publications(access_tier);
CREATE INDEX IF NOT EXISTS idx_publications_org ON publications(organization_id);

-- ============================================================
-- PUBLICATION CHARTS: Embedded chart snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS publication_charts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  endpoint VARCHAR(500) NOT NULL,           -- Analytics API endpoint
  params JSONB DEFAULT '{}'::jsonb,         -- Query parameters used
  chart_type VARCHAR(50) DEFAULT 'line',    -- line, bar, heatmap, sparkline, donut, forecast
  component_name VARCHAR(100),              -- React component to render
  title VARCHAR(255),
  ai_insight TEXT,                          -- AI-generated insight for this chart
  snapshot_data JSONB,                      -- Frozen API response at publish time
  snapshot_at TIMESTAMPTZ,                  -- When data was captured
  snapshot_png_url TEXT,                    -- Pre-rendered PNG for PDF/email
  live_enabled BOOLEAN DEFAULT false,       -- Allow live data toggle
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pub_charts_publication ON publication_charts(publication_id);

-- ============================================================
-- INDEX VALUES: Proprietary index tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS index_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  index_type VARCHAR(30) NOT NULL CHECK (index_type IN (
    'ghpi', 'ghai', 'cci', 'gcpi', 'gprs', 'gmti', 'psi', 'dii', 'cap_rate'
  )),
  region VARCHAR(100) DEFAULT 'national',
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  value DECIMAL(12,4) NOT NULL,
  change_mom DECIMAL(8,4),
  change_yoy DECIMAL(8,4),
  ai_commentary TEXT,
  published_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_index_values_type ON index_values(index_type);
CREATE INDEX IF NOT EXISTS idx_index_values_period ON index_values(period_end DESC);
CREATE INDEX IF NOT EXISTS idx_index_values_region ON index_values(region);
CREATE UNIQUE INDEX IF NOT EXISTS idx_index_values_unique
  ON index_values(index_type, region, period_end);

-- ============================================================
-- NEWSLETTER SUBSCRIBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  organization VARCHAR(255),
  role VARCHAR(100),
  segments JSONB DEFAULT '[]'::jsonb,       -- topics/sectors subscribed to
  tier VARCHAR(30) DEFAULT 'free' CHECK (tier IN ('free', 'professional', 'enterprise')),
  subscribed_at TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ,
  confirmed BOOLEAN DEFAULT false,
  confirm_token VARCHAR(255)
);

CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_tier ON newsletter_subscribers(tier);

-- ============================================================
-- PUBLICATION VIEWS: Analytics tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS publication_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id UUID NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  user_id UUID,
  session_id VARCHAR(100),
  viewed_at TIMESTAMPTZ DEFAULT NOW(),
  time_on_page_seconds INT,
  scroll_depth DECIMAL(5,2),
  pdf_downloaded BOOLEAN DEFAULT false,
  source VARCHAR(50) DEFAULT 'direct'       -- direct, newsletter, social, search, api
);

CREATE INDEX IF NOT EXISTS idx_pub_views_publication ON publication_views(publication_id);
CREATE INDEX IF NOT EXISTS idx_pub_views_viewed_at ON publication_views(viewed_at DESC);

-- ============================================================
-- SEED: Reference taxonomy data
-- ============================================================

-- Insert some initial index values for demo purposes
INSERT INTO index_values (index_type, region, period_start, period_end, value, change_mom, change_yoy, ai_commentary, published_at)
VALUES
  -- GHPI - Ghana House Price Index
  ('ghpi', 'national', '2025-12-01', '2025-12-31', 142.8, 1.2, 8.4,
   'The Ghana House Price Index rose 1.2% in December 2025, extending the upward trajectory driven by sustained demand in Greater Accra and Ashanti regions. Year-on-year growth of 8.4% outpaces inflation, signaling genuine real appreciation in residential property values.',
   NOW()),
  ('ghpi', 'greater_accra', '2025-12-01', '2025-12-31', 168.3, 1.6, 11.2,
   'Greater Accra leads national price growth with an 11.2% annual increase, driven by luxury segment demand in East Legon and Airport City corridors.',
   NOW()),

  -- GHAI - Ghana Housing Affordability Index
  ('ghai', 'national', '2025-10-01', '2025-12-31', 0.34, -0.02, -0.05,
   'Housing affordability continues to deteriorate nationally. The median household can now afford only 34% of the median home price, down from 36% a year ago. Mortgage accessibility remains constrained by BoG policy rate impacts.',
   NOW()),

  -- CCI - Construction Cost Index
  ('cci', 'national', '2025-12-01', '2025-12-31', 287.6, -1.8, 12.3,
   'Construction costs moderated in December with a 1.8% MoM decline, driven by stabilizing cement and steel prices. However, YoY increases of 12.3% continue to pressure developer margins.',
   NOW()),

  -- GCPI - Ghana Commercial Property Index
  ('gcpi', 'national', '2025-10-01', '2025-12-31', 118.5, 0.8, 5.2,
   'Commercial property values showed steady growth in Q4 2025, supported by Grade A office demand in Airport City and expanding retail footprints in Accra Mall and West Hills corridors.',
   NOW()),

  -- PSI - PropMetrik Sentiment Index
  ('psi', 'national', '2025-12-23', '2025-12-29', 62.4, 3.1, NULL,
   'Market sentiment improved to 62.4 this week, crossing into optimistic territory. Positive catalysts include announced infrastructure projects and declining mortgage rates.',
   NOW())
ON CONFLICT DO NOTHING;

COMMIT;
