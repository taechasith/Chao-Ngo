-- Close submitted forms without claiming incomplete optional text was completed.
ALTER TABLE questionnaire_sessions ADD COLUMN closed_at TEXT;
UPDATE questionnaire_sessions SET closed_at = CURRENT_TIMESTAMP
 WHERE completed_at IS NULL AND EXISTS (SELECT 1 FROM submissions s
   WHERE s.status != 'draft' AND (s.questionnaire_session_id = questionnaire_sessions.id OR s.posttest_session_id = questionnaire_sessions.id));
DROP INDEX questionnaire_sessions_active_unique_idx;
CREATE UNIQUE INDEX questionnaire_sessions_active_unique_idx ON questionnaire_sessions(user_id, questionnaire_id)
 WHERE completed_at IS NULL AND closed_at IS NULL;
ALTER TABLE submissions ADD COLUMN reviewer_note TEXT;
ALTER TABLE submissions ADD COLUMN revision_of_submission_id TEXT REFERENCES submissions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX submissions_revision_parent_unique_idx ON submissions(revision_of_submission_id)
  WHERE revision_of_submission_id IS NOT NULL;
INSERT INTO app_metadata (key, value) VALUES ('schema_version', '0015_submission_reviews')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;
