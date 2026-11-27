-- Security hardening: composite workspace_versions primary key & revoked_sessions store

CREATE TABLE IF NOT EXISTS workspace_versions_v2 (
  id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  dbml TEXT NOT NULL,
  table_positions_json TEXT NOT NULL,
  sticky_notes_json TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

INSERT OR IGNORE INTO workspace_versions_v2 (
  id,
  workspace_id,
  owner_user_id,
  tag,
  title,
  description,
  dbml,
  table_positions_json,
  sticky_notes_json,
  is_published,
  created_at
)
SELECT
  v.id,
  v.workspace_id,
  v.owner_user_id,
  v.tag,
  v.title,
  v.description,
  v.dbml,
  v.table_positions_json,
  v.sticky_notes_json,
  v.is_published,
  v.created_at
FROM workspace_versions v
JOIN workspaces w
  ON w.id = v.workspace_id
 AND w.owner_user_id = v.owner_user_id;

DROP TABLE workspace_versions;

ALTER TABLE workspace_versions_v2 RENAME TO workspace_versions;

CREATE INDEX IF NOT EXISTS idx_versions_workspace_created
  ON workspace_versions(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS revoked_sessions (
  jti TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_sessions_expires
  ON revoked_sessions(expires_at);
