-- Participant-entered skills belong to the private research profile.
ALTER TABLE user_profiles ADD COLUMN personal_skills_json TEXT NOT NULL DEFAULT '[]';

INSERT INTO app_metadata (key, value) VALUES ('schema_version', '0014_research_profile_skills')
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP;
