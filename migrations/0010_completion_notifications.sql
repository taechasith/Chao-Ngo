ALTER TABLE subgames ADD COLUMN required_for_completion INTEGER NOT NULL DEFAULT 1
  CHECK (required_for_completion IN (0, 1));

CREATE TABLE IF NOT EXISTS thank_you_letters (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'eligible', 'emailed')),
  eligibility_snapshot_json TEXT NOT NULL CHECK (json_valid(eligibility_snapshot_json)),
  eligible_at TEXT,
  letter_emailed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  notification_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('subgame_completed', 'all_cases_completed', 'letter_eligible', 'needs_revision')),
  body_th TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS player_notifications_user_id_created_at_idx
  ON player_notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_notifications (
  id TEXT PRIMARY KEY,
  notification_key TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('submission_ready_for_review', 'letter_eligible', 'needs_revision')),
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  acknowledged_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS admin_notifications_type_created_at_idx
  ON admin_notifications (type, created_at DESC);

INSERT INTO app_metadata (key, value) VALUES ('completion_auto_pass_submissions', 'true')
ON CONFLICT(key) DO NOTHING;

INSERT INTO app_metadata (key, value) VALUES ('schema_version', '0010_completion_notifications')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;
