INSERT INTO app_metadata (key, value) VALUES ('research_collection_enabled', 'false')
ON CONFLICT(key) DO NOTHING;

ALTER TABLE "user" ADD COLUMN research_deletion_pending_at TEXT;
ALTER TABLE "user" ADD COLUMN research_retention_hold_until TEXT;

CREATE INDEX user_research_expiry_idx ON "user" (research_retention_expires_at)
WHERE research_retention_expires_at IS NOT NULL;

INSERT INTO app_metadata (key, value) VALUES ('schema_version', '0009_submission_retention_gate')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;
