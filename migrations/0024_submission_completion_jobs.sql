CREATE TABLE completion_jobs (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  revision TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL DEFAULT (unixepoch()),
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX completion_jobs_due ON completion_jobs(next_attempt_at, lease_until);
