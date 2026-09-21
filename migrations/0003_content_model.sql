CREATE TABLE IF NOT EXISTS content_versions (
  id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  version TEXT NOT NULL,
  data_json TEXT NOT NULL,
  published_at TEXT,
  published_by_admin_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (content_type, version)
);

CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('hidden', 'coming_soon', 'playable')),
  description TEXT,
  assistant_url TEXT,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timeline_nodes (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  node_type TEXT NOT NULL CHECK (node_type IN ('intro', 'context', 'subgame', 'outro')),
  sort_order INTEGER NOT NULL,
  published INTEGER NOT NULL CHECK (published IN (0, 1)),
  UNIQUE (game_id, slug)
);

CREATE TABLE IF NOT EXISTS subgames (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  academic_field TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('hidden', 'coming_soon', 'playable')),
  timeline_node_id TEXT REFERENCES timeline_nodes(id) ON DELETE SET NULL,
  entry_difficulty TEXT NOT NULL DEFAULT 'standard',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (game_id, slug)
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  subgame_id TEXT REFERENCES subgames(id) ON DELETE SET NULL,
  timeline_node_id TEXT REFERENCES timeline_nodes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'pdf', 'audio', 'video', 'text', 'other')),
  r2_key TEXT NOT NULL UNIQUE,
  public_url TEXT,
  player_visible INTEGER NOT NULL CHECK (player_visible IN (0, 1)),
  sort_order INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  source_path TEXT UNIQUE,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS timeline_nodes_game_id_sort_order_idx
  ON timeline_nodes (game_id, sort_order);

CREATE INDEX IF NOT EXISTS subgames_game_id_status_idx
  ON subgames (game_id, status);

CREATE INDEX IF NOT EXISTS assets_subgame_id_sort_order_idx
  ON assets (subgame_id, sort_order);

CREATE INDEX IF NOT EXISTS assets_timeline_node_id_sort_order_idx
  ON assets (timeline_node_id, sort_order);

INSERT INTO games (id, slug, title, status, description, assistant_url, sort_order)
VALUES
  (
    'game-node-zone',
    'node-zone',
    'NODE ZONE',
    'playable',
    'Detective-style science casefiles.',
    'https://gemini.google.com/gem/45cb7e3f0314',
    10
  ),
  (
    'game-ka-casefiles',
    'ka-casefiles',
    'The K.A. Casefiles',
    'coming_soon',
    'Casefiles are unavailable until an administrator publishes them.',
    'https://gemini.google.com/gem/45cb7e3f0314',
    20
  );

INSERT INTO timeline_nodes (id, game_id, slug, title, summary, node_type, sort_order, published)
VALUES
  (
    'timeline-node-zone-pre-case',
    'game-node-zone',
    'pre-case',
    'Pre-case records',
    'Records supplied before the casefiles.',
    'intro',
    10,
    1
  ),
  (
    'timeline-node-zone-quantum',
    'game-node-zone',
    'quantum',
    'The Correct Trajectory',
    'NODE ZONE casefile 1.',
    'subgame',
    20,
    1
  ),
  (
    'timeline-node-zone-space',
    'game-node-zone',
    'space',
    'Thirteen Days in Utopia',
    'NODE ZONE casefile 2.',
    'subgame',
    30,
    1
  ),
  (
    'timeline-node-zone-post-case',
    'game-node-zone',
    'post-case',
    'Post-case scientific record',
    'Record supplied after the casefiles.',
    'outro',
    40,
    1
  );

INSERT INTO subgames (
  id, game_id, slug, title, academic_field, status, timeline_node_id, entry_difficulty
)
VALUES
  (
    'subgame-node-zone-quantum',
    'game-node-zone',
    'quantum',
    'The Correct Trajectory',
    'quantum',
    'playable',
    'timeline-node-zone-quantum',
    'standard'
  ),
  (
    'subgame-node-zone-space',
    'game-node-zone',
    'space',
    'Thirteen Days in Utopia',
    'space',
    'playable',
    'timeline-node-zone-space',
    'standard'
  ),
  (
    'subgame-ka-psychology',
    'game-ka-casefiles',
    'psychology',
    'Psychology',
    'psychology',
    'coming_soon',
    NULL,
    'standard'
  ),
  (
    'subgame-ka-fintech',
    'game-ka-casefiles',
    'fintech',
    'FinTech',
    'fintech',
    'coming_soon',
    NULL,
    'standard'
  ),
  (
    'subgame-ka-biotech',
    'game-ka-casefiles',
    'biotech',
    'Human-focused Biotech',
    'biotech',
    'coming_soon',
    NULL,
    'standard'
  );

INSERT INTO content_versions (
  id, content_type, status, version, data_json, published_at, published_by_admin_id
)
VALUES (
  'content-version-node-zone-import-v1',
  'node-zone-import',
  'published',
  '2026.09.19.1',
  '{"source":"approved-node-zone-folders","assetImport":"scripts/import-node-zone.ts"}',
  CURRENT_TIMESTAMP,
  NULL
);

INSERT INTO app_metadata (key, value)
VALUES ('schema_version', '0003_content_model')
ON CONFLICT(key) DO UPDATE SET
  value = excluded.value,
  updated_at = CURRENT_TIMESTAMP;
