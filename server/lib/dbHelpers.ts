import type { D1DatabaseLike, GithubUserSummary } from '../types';

export interface WorkspaceRow {
  id: string;
  owner_user_id: string;
  name: string;
  description: string;
  dbml: string;
  schema_files_json: string | null;
  active_schema_file: string | null;
  schema_folder: string | null;
  table_positions_json: string;
  group_meta_json: string;
  sticky_notes_json: string;
  detail_level: string;
  github_link_json: string | null;
  github_repo_link_json: string | null;
  url_link_json: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface WorkspaceVersionRow {
  id: string;
  workspace_id: string;
  owner_user_id: string;
  tag: string;
  title: string;
  description: string;
  dbml: string;
  table_positions_json: string;
  sticky_notes_json: string;
  is_published: number;
  created_at: string;
}

export interface ShareLinkRow {
  id: string;
  token: string;
  workspace_id: string;
  owner_user_id: string;
  label: string;
  pinned_version_tag: string | null;
  default_view: string;
  allow_diagram_export: number;
  created_by_login: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export function resolveUserId(user: GithubUserSummary): string {
  if (typeof user.id === 'number' && Number.isFinite(user.id)) {
    return `gh_${user.id}`;
  }
  return `gh_login_${user.login.toLowerCase()}`;
}

export async function upsertCloudUser(
  db: D1DatabaseLike,
  user: GithubUserSummary
): Promise<string> {
  const userId = resolveUserId(user);
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO users (id, github_id, github_login, name, avatar_url, html_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         github_id = COALESCE(excluded.github_id, users.github_id),
         github_login = excluded.github_login,
         name = excluded.name,
         avatar_url = excluded.avatar_url,
         html_url = excluded.html_url,
         updated_at = excluded.updated_at`
    )
    .bind(
      userId,
      typeof user.id === 'number' ? user.id : null,
      user.login,
      user.name ?? null,
      user.avatar_url || null,
      user.html_url || null,
      now,
      now
    )
    .run();
  return userId;
}

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function workspaceRowToClient(
  row: WorkspaceRow,
  versions: WorkspaceVersionRow[]
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    dbml: row.dbml,
    schemaFiles: safeJsonParse(row.schema_files_json, undefined),
    activeSchemaFile: row.active_schema_file || undefined,
    schemaFolder: row.schema_folder || undefined,
    tablePositions: safeJsonParse(row.table_positions_json, {}),
    groupMeta: safeJsonParse(row.group_meta_json, {}),
    stickyNotes: safeJsonParse(row.sticky_notes_json, []),
    detailLevel:
      row.detail_level === 'columns' ||
      row.detail_level === 'keys' ||
      row.detail_level === 'names'
        ? row.detail_level
        : 'full',
    versions: versions.map((v) => ({
      id: v.id,
      tag: v.tag,
      title: v.title,
      description: v.description,
      dbml: v.dbml,
      tablePositions: safeJsonParse(v.table_positions_json, {}),
      stickyNotes: safeJsonParse(v.sticky_notes_json, []),
      createdAt: v.created_at,
      isPublished: Boolean(v.is_published),
    })),
    githubLink: safeJsonParse(row.github_link_json, undefined),
    githubRepoLink: safeJsonParse(row.github_repo_link_json, undefined),
    urlLink: safeJsonParse(row.url_link_json, undefined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncOrigin: 'cloud' as const,
    cloudSyncedAt: row.updated_at,
    cloudRevision: row.revision,
  };
}

export function shareRowToClient(row: ShareLinkRow) {
  return {
    id: row.id,
    token: row.token,
    workspaceId: row.workspace_id,
    label: row.label,
    pinnedVersionTag: row.pinned_version_tag,
    defaultView: row.default_view === 'diagram' ? 'diagram' : 'docs',
    allowDiagramExport: Boolean(row.allow_diagram_export),
    createdByLogin: row.created_by_login,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}
