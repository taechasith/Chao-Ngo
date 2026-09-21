CREATE TABLE IF NOT EXISTS player_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE RESTRICT,
  subgame_id TEXT REFERENCES subgames(id) ON DELETE RESTRICT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS player_sessions_user_id_last_seen_at_idx
  ON player_sessions (user_id, last_seen_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS player_sessions_active_subgame_unique_idx
  ON player_sessions (user_id, subgame_id)
  WHERE subgame_id IS NOT NULL AND completed_at IS NULL;

CREATE TABLE IF NOT EXISTS subgame_progress (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  subgame_id TEXT NOT NULL REFERENCES subgames(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('not_started', 'in_progress', 'completed')),
  started_at TEXT,
  last_activity_at TEXT,
  completed_at TEXT,
  player_session_id TEXT REFERENCES player_sessions(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, subgame_id)
);

CREATE INDEX IF NOT EXISTS subgame_progress_user_id_status_idx
  ON subgame_progress (user_id, status);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES "user"(id) ON DELETE SET NULL,
  session_id TEXT REFERENCES player_sessions(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'landing_viewed',
      'signup_started',
      'signup_completed',
      'login_succeeded',
      'login_failed_rate_limited',
      'pregame_started',
      'pregame_answer_saved',
      'pregame_completed',
      'recommendation_shown',
      'game_selected',
      'subgame_started',
      'timeline_node_opened',
      'evidence_opened',
      'assistant_link_opened',
      'submission_draft_saved',
      'submission_finalized',
      'posttest_started',
      'posttest_answer_saved',
      'posttest_completed',
      'ai_pdf_upload_started',
      'ai_pdf_upload_completed',
      'subgame_completed',
      'all_required_subgames_completed',
      'thank_you_letter_eligible',
      'logout'
    )
  ),
  game_id TEXT REFERENCES games(id) ON DELETE SET NULL,
  subgame_id TEXT REFERENCES subgames(id) ON DELETE SET NULL,
  timeline_node_id TEXT REFERENCES timeline_nodes(id) ON DELETE SET NULL,
  asset_id TEXT REFERENCES assets(id) ON DELETE SET NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json TEXT NOT NULL CHECK (length(payload_json) <= 2048 AND json_valid(payload_json))
);

CREATE INDEX IF NOT EXISTS activity_events_user_id_occurred_at_idx
  ON activity_events (user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS activity_events_session_id_occurred_at_idx
  ON activity_events (session_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  achievement_key TEXT NOT NULL,
  subgame_id TEXT REFERENCES subgames(id) ON DELETE SET NULL,
  scope_key TEXT NOT NULL,
  earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata_json TEXT NOT NULL CHECK (length(metadata_json) <= 2048 AND json_valid(metadata_json)),
  UNIQUE (user_id, achievement_key, scope_key)
);

CREATE INDEX IF NOT EXISTS achievements_user_id_earned_at_idx
  ON achievements (user_id, earned_at DESC);

INSERT INTO app_metadata (key, value)
VALUES ('schema_version', '0006_player_progress_and_events')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
