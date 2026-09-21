ALTER TABLE "user" ADD COLUMN research_retention_expires_at TEXT;

CREATE TABLE IF NOT EXISTS submission_consent_acknowledgements (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE REFERENCES submissions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  consent_version TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS submission_consent_ack_user_idx
  ON submission_consent_acknowledgements (user_id, acknowledged_at DESC);

-- Admin config contract: update this integer to change the retention window (1-20 years).
INSERT INTO app_metadata (key, value)
VALUES ('research_retention_years', '3')
ON CONFLICT(key) DO NOTHING;

INSERT INTO app_metadata (key, value)
VALUES ('schema_version', '0008_research_retention')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
