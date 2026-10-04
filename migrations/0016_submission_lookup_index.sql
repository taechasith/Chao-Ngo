-- Latest draft/revision lookups are scoped by owner and case throughout the player flow.
CREATE INDEX IF NOT EXISTS submissions_user_subgame_created_idx
  ON submissions (user_id, subgame_id, created_at DESC);
