-- 270_analytics_api_ws_usage.sql
-- WebSocket streaming usage metering for the developer portal.
-- Mirrors api_key_usage_daily (migration 153) but for the /ws/analytics gateway:
-- one row per key per day accumulating opened connections, frames pushed to the
-- client, and summed connection duration (for connection-minute billing later).

CREATE TABLE IF NOT EXISTS api_key_ws_usage_daily (
  id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key_id             UUID NOT NULL REFERENCES org_api_keys(id) ON DELETE CASCADE,
  date               DATE NOT NULL DEFAULT CURRENT_DATE,
  connections        INTEGER DEFAULT 0,   -- WebSocket connections opened
  messages           BIGINT  DEFAULT 0,   -- data frames pushed to the client
  connection_seconds BIGINT  DEFAULT 0,   -- summed connection duration
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (key_id, date)
);

CREATE INDEX IF NOT EXISTS idx_api_key_ws_usage_date
  ON api_key_ws_usage_daily (key_id, date DESC);

COMMENT ON TABLE api_key_ws_usage_daily IS 'Daily per-key WebSocket streaming usage (/ws/analytics gateway).';
