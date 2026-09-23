CREATE TABLE IF NOT EXISTS context_chunks (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_title TEXT NOT NULL,
  source_path TEXT NOT NULL,
  section TEXT NOT NULL,
  content TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS context_fts USING fts5(
  id UNINDEXED,
  source_title,
  section,
  content,
  tokenize = 'porter unicode61'
);

CREATE TABLE IF NOT EXISTS request_limits (
  key TEXT NOT NULL,
  minute INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (key, minute)
);

CREATE INDEX IF NOT EXISTS context_source_idx ON context_chunks(source_id);
CREATE INDEX IF NOT EXISTS context_priority_idx ON context_chunks(priority DESC);
