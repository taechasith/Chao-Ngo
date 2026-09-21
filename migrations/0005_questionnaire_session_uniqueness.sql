CREATE UNIQUE INDEX IF NOT EXISTS questionnaire_sessions_active_unique_idx
  ON questionnaire_sessions (user_id, questionnaire_id)
  WHERE completed_at IS NULL;

INSERT INTO app_metadata (key, value)
VALUES ('schema_version', '0005_questionnaire_session_uniqueness')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
