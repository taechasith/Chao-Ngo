CREATE TABLE IF NOT EXISTS questionnaire_session_updates (
 previous_session_id TEXT PRIMARY KEY REFERENCES questionnaire_sessions(id) ON DELETE CASCADE,
 current_session_id TEXT NOT NULL REFERENCES questionnaire_sessions(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS questionnaire_session_updates_current_idx ON questionnaire_session_updates(current_session_id);
