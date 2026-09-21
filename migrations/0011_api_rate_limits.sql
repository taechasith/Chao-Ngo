CREATE TABLE IF NOT EXISTS player_rate_limits (
  rate_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL CHECK (request_count >= 0),
  window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS player_rate_limits_updated_at_idx
  ON player_rate_limits (updated_at);

INSERT INTO app_metadata (key, value) VALUES ('schema_version', '0011_api_rate_limits')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;
