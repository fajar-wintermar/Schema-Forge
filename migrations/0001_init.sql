-- SchemaForge D1 Database Schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_id INTEGER UNIQUE,
  github_login TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  html_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  dbml TEXT NOT NULL,
  schema_files_json TEXT,
  active_schema_file TEXT,
  schema_folder TEXT,
  table_positions_json TEXT NOT NULL,
  group_meta_json TEXT NOT NULL,
  sticky_notes_json TEXT NOT NULL,
  detail_level TEXT NOT NULL DEFAULT 'full',
  github_link_json TEXT,
  github_repo_link_json TEXT,
  url_link_json TEXT,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner_updated
  ON workspaces(owner_user_id, deleted_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS workspace_versions (
  id TEXT PRIMARY KEY,
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
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_versions_workspace_created
  ON workspace_versions(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS share_links (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  pinned_version_tag TEXT,
  default_view TEXT NOT NULL DEFAULT 'docs',
  created_by_login TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

CREATE INDEX IF NOT EXISTS idx_share_links_token
  ON share_links(token);

CREATE INDEX IF NOT EXISTS idx_share_links_workspace
  ON share_links(workspace_id, owner_user_id, created_at DESC);
