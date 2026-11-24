import type {
  DetailLevel,
  GithubFileLink,
  GithubRepoLink,
  GroupCustomMeta,
  SchemaModuleFile,
  ShareLinkRecord,
  StickyNote,
  StickyNoteColor,
  TablePosition,
  UrlFileLink,
  WorkspaceProject,
} from '../../src/types/schema';
import type { D1DatabaseLike, GithubUserSummary } from '../types';
import { isRecord } from './http';

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

export function safeJsonParse<T>(
  raw: string | null | undefined,
  fallback: T,
  guard: (value: unknown) => value is T
): T {
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function isTablePositionsMap(
  value: unknown
): value is Record<string, TablePosition> {
  if (!isRecord(value)) return false;
  for (const pos of Object.values(value)) {
    if (
      !isRecord(pos) ||
      typeof pos.x !== 'number' ||
      typeof pos.y !== 'number'
    ) {
      return false;
    }
  }
  return true;
}

export function isGroupMetaMap(
  value: unknown
): value is Record<string, GroupCustomMeta> {
  if (!isRecord(value)) return false;
  for (const meta of Object.values(value)) {
    if (!isRecord(meta)) return false;
  }
  return true;
}

function isStickyNoteColor(value: unknown): value is StickyNoteColor {
  return (
    value === 'amber' ||
    value === 'sky' ||
    value === 'emerald' ||
    value === 'rose' ||
    value === 'slate'
  );
}

export function isStickyNoteArray(value: unknown): value is StickyNote[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.x === 'number' &&
      typeof item.y === 'number' &&
      typeof item.width === 'number' &&
      isStickyNoteColor(item.color) &&
      typeof item.title === 'string' &&
      typeof item.content === 'string' &&
      typeof item.author === 'string' &&
      typeof item.updatedAt === 'string'
  );
}

function isSchemaModuleFile(value: unknown): value is SchemaModuleFile {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.path === 'string' &&
    typeof value.content === 'string'
  );
}

function isSchemaModuleFiles(
  value: unknown
): value is SchemaModuleFile[] | undefined {
  if (value === undefined) return true;
  return Array.isArray(value) && value.every(isSchemaModuleFile);
}

function isGithubFileLink(
  value: unknown
): value is GithubFileLink | undefined {
  if (value === undefined) return true;
  return (
    isRecord(value) &&
    typeof value.owner === 'string' &&
    typeof value.repo === 'string' &&
    typeof value.branch === 'string' &&
    typeof value.path === 'string' &&
    typeof value.sha === 'string' &&
    typeof value.lastSyncedDbml === 'string' &&
    typeof value.lastSyncedAt === 'string'
  );
}

function isGithubRepoLink(
  value: unknown
): value is GithubRepoLink | undefined {
  if (value === undefined) return true;
  return (
    isRecord(value) &&
    typeof value.owner === 'string' &&
    typeof value.repo === 'string' &&
    typeof value.branch === 'string' &&
    typeof value.schemaFolder === 'string' &&
    typeof value.lastSyncedAt === 'string'
  );
}

function isUrlFileLink(value: unknown): value is UrlFileLink | undefined {
  if (value === undefined) return true;
  return (
    isRecord(value) &&
    typeof value.url === 'string' &&
    typeof value.loadedAt === 'string'
  );
}

export function normalizeDetailLevel(raw: string): DetailLevel {
  if (raw === 'columns' || raw === 'keys' || raw === 'names') {
    return raw;
  }
  return 'full';
}

export function workspaceRowToClient(
  row: WorkspaceRow,
  versions: WorkspaceVersionRow[]
): WorkspaceProject {
  const emptyPositions: Record<string, TablePosition> = {};
  const emptyGroupMeta: Record<string, GroupCustomMeta> = {};
  const emptyNotes: StickyNote[] = [];

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    dbml: row.dbml,
    schemaFiles: safeJsonParse<SchemaModuleFile[] | undefined>(
      row.schema_files_json,
      undefined,
      isSchemaModuleFiles
    ),
    activeSchemaFile: row.active_schema_file || undefined,
    schemaFolder: row.schema_folder || undefined,
    tablePositions: safeJsonParse(
      row.table_positions_json,
      emptyPositions,
      isTablePositionsMap
    ),
    groupMeta: safeJsonParse(
      row.group_meta_json,
      emptyGroupMeta,
      isGroupMetaMap
    ),
    stickyNotes: safeJsonParse(
      row.sticky_notes_json,
      emptyNotes,
      isStickyNoteArray
    ),
    detailLevel: normalizeDetailLevel(row.detail_level),
    versions: versions.map((v) => ({
      id: v.id,
      tag: v.tag,
      title: v.title,
      description: v.description,
      dbml: v.dbml,
      tablePositions: safeJsonParse(
        v.table_positions_json,
        emptyPositions,
        isTablePositionsMap
      ),
      stickyNotes: safeJsonParse(
        v.sticky_notes_json,
        emptyNotes,
        isStickyNoteArray
      ),
      createdAt: v.created_at,
      isPublished: Boolean(v.is_published),
    })),
    githubLink: safeJsonParse<GithubFileLink | undefined>(
      row.github_link_json,
      undefined,
      isGithubFileLink
    ),
    githubRepoLink: safeJsonParse<GithubRepoLink | undefined>(
      row.github_repo_link_json,
      undefined,
      isGithubRepoLink
    ),
    urlLink: safeJsonParse<UrlFileLink | undefined>(
      row.url_link_json,
      undefined,
      isUrlFileLink
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    syncOrigin: 'cloud',
    cloudSyncedAt: row.updated_at,
    cloudRevision: row.revision,
  };
}

export function shareRowToClient(row: ShareLinkRow): ShareLinkRecord {
  const defaultView: 'docs' | 'diagram' =
    row.default_view === 'diagram' ? 'diagram' : 'docs';
  return {
    id: row.id,
    token: row.token,
    workspaceId: row.workspace_id,
    label: row.label,
    pinnedVersionTag: row.pinned_version_tag,
    defaultView,
    allowDiagramExport: Boolean(row.allow_diagram_export),
    createdByLogin: row.created_by_login,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}
