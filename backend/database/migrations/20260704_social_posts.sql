-- Social media post tracking — records each listing publish to a social platform (TikTok first).
-- Enables idempotency, async status polling, and a "posted" state in the UI. Idempotent.

CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  property_id UUID,
  platform VARCHAR(30) NOT NULL,          -- tiktok, facebook, instagram, linkedin, twitter_x
  publish_id VARCHAR(255),                -- provider-side publish/job id (TikTok publish_id)
  status VARCHAR(30) NOT NULL DEFAULT 'processing', -- processing, published, failed
  post_url TEXT,                          -- public URL of the resulting post, when available
  caption TEXT,
  media_count INT DEFAULT 0,
  error TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_posts_org ON social_posts (organization_id, platform, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_property ON social_posts (property_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_publish ON social_posts (publish_id);
