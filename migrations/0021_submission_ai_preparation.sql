-- Add private submission metadata without changing answers, uploads or receipts.
ALTER TABLE submissions ADD COLUMN additional_ai_links_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE submissions ADD COLUMN ai_companion_confirmed_at TEXT;
INSERT INTO app_metadata (key,value) VALUES ('schema_version','0021_submission_ai_preparation')
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP;
