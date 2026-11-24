import type { WorkspaceProject } from '../../src/types/schema';
import type {
  D1DatabaseLike,
  D1PreparedStatementLike,
  GithubUserSummary,
} from '../types';
import {
  resolveUserId,
  upsertCloudUser,
  workspaceRowToClient,
  type WorkspaceRow,
  type WorkspaceVersionRow,
} from '../lib/dbHelpers';
import { isRecord, sanitizeId, type ServiceResult } from '../lib/http';

const VALID_DETAIL_LEVELS = new Set(['full', 'columns', 'keys', 'names']);

export interface IncomingVersionInput {
  id?: unknown;
  tag?: unknown;
  title?: unknown;
  description?: unknown;
  dbml?: unknown;
  tablePositions?: unknown;
  stickyNotes?: unknown;
  createdAt?: unknown;
  isPublished?: unknown;
}

export interface IncomingWorkspaceInput {
  name?: unknown;
  description?: unknown;
  dbml?: unknown;
  schemaFiles?: unknown;
  activeSchemaFile?: unknown;
  schemaFolder?: unknown;
  tablePositions?: unknown;
  groupMeta?: unknown;
  stickyNotes?: unknown;
  detailLevel?: unknown;
  versions?: unknown;
  githubLink?: unknown;
  githubRepoLink?: unknown;
  urlLink?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export async function listUserWorkspaces(
  db: D1DatabaseLike,
  user: GithubUserSummary
): Promise<WorkspaceProject[]> {
  const userId = resolveUserId(user);
  await upsertCloudUser(db, user);

  const wsResult = await db
    .prepare(
      `SELECT * FROM workspaces
       WHERE owner_user_id = ? AND deleted_at IS NULL
       ORDER BY updated_at DESC`
    )
    .bind(userId)
    .all<WorkspaceRow>();

  const verResult = await db
    .prepare(
      `SELECT * FROM workspace_versions
       WHERE owner_user_id = ?
       ORDER BY created_at DESC`
    )
    .bind(userId)
    .all<WorkspaceVersionRow>();

  const versionsByWs = new Map<string, WorkspaceVersionRow[]>();
  for (const v of verResult.results) {
    const list = versionsByWs.get(v.workspace_id);
    if (list) list.push(v);
    else versionsByWs.set(v.workspace_id, [v]);
  }

  return wsResult.results.map((row) =>
    workspaceRowToClient(row, versionsByWs.get(row.id) || [])
  );
}

export async function getUserWorkspaceById(
  db: D1DatabaseLike,
  user: GithubUserSummary,
  rawWorkspaceId: string
): Promise<ServiceResult<WorkspaceProject>> {
  const workspaceId = sanitizeId(rawWorkspaceId);
  if (!workspaceId) {
    return { ok: false, status: 400, error: 'Invalid workspace ID.' };
  }

  const userId = resolveUserId(user);
  const row = await db
    .prepare(
      `SELECT * FROM workspaces
       WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`
    )
    .bind(workspaceId, userId)
    .first<WorkspaceRow>();

  if (!row) {
    return { ok: false, status: 404, error: 'Workspace not found.' };
  }

  const verResult = await db
    .prepare(
      `SELECT * FROM workspace_versions
       WHERE workspace_id = ? AND owner_user_id = ?
       ORDER BY created_at DESC`
    )
    .bind(workspaceId, userId)
    .all<WorkspaceVersionRow>();

  return {
    ok: true,
    data: workspaceRowToClient(row, verResult.results),
  };
}

export async function upsertUserWorkspace(
  db: D1DatabaseLike,
  user: GithubUserSummary,
  rawWorkspaceId: string,
  body: IncomingWorkspaceInput
): Promise<ServiceResult<{ ok: true; revision: number; syncedAt: string }>> {
  const workspaceId = sanitizeId(rawWorkspaceId);
  if (!workspaceId) {
    return { ok: false, status: 400, error: 'Invalid workspace ID.' };
  }

  const name =
    typeof body.name === 'string' ? body.name.trim().slice(0, 140) : '';
  if (!name) {
    return { ok: false, status: 400, error: 'Workspace name is required.' };
  }

  const dbml = typeof body.dbml === 'string' ? body.dbml : '';
  if (dbml.length > 4 * 1024 * 1024) {
    return {
      ok: false,
      status: 413,
      error: 'Schema exceeds 4 MB cloud limit.',
    };
  }

  const userId = resolveUserId(user);
  await upsertCloudUser(db, user);

  const existing = await db
    .prepare(
      `SELECT id, owner_user_id, revision, created_at FROM workspaces WHERE id = ?`
    )
    .bind(workspaceId)
    .first<{
      id: string;
      owner_user_id: string;
      revision: number;
      created_at: string;
    }>();

  if (existing && existing.owner_user_id !== userId) {
    return {
      ok: false,
      status: 403,
      error: 'You do not have permission to modify this workspace.',
    };
  }

  const now = new Date().toISOString();
  const description =
    typeof body.description === 'string'
      ? body.description.slice(0, 500)
      : '';
  const detailLevel =
    typeof body.detailLevel === 'string' &&
    VALID_DETAIL_LEVELS.has(body.detailLevel)
      ? body.detailLevel
      : 'full';
  const schemaFilesJson = Array.isArray(body.schemaFiles)
    ? JSON.stringify(body.schemaFiles)
    : null;
  const activeSchemaFile =
    typeof body.activeSchemaFile === 'string'
      ? body.activeSchemaFile.slice(0, 260)
      : null;
  const schemaFolder =
    typeof body.schemaFolder === 'string'
      ? body.schemaFolder.slice(0, 180)
      : null;
  const tablePositionsJson = JSON.stringify(
    isRecord(body.tablePositions) ? body.tablePositions : {}
  );
  const groupMetaJson = JSON.stringify(
    isRecord(body.groupMeta) ? body.groupMeta : {}
  );
  const stickyNotesJson = JSON.stringify(
    Array.isArray(body.stickyNotes) ? body.stickyNotes : []
  );
  const githubLinkJson = isRecord(body.githubLink)
    ? JSON.stringify(body.githubLink)
    : null;
  const githubRepoLinkJson = isRecord(body.githubRepoLink)
    ? JSON.stringify(body.githubRepoLink)
    : null;
  const urlLinkJson = isRecord(body.urlLink)
    ? JSON.stringify(body.urlLink)
    : null;

  const createdAt =
    existing?.created_at ||
    (typeof body.createdAt === 'string' && body.createdAt) ||
    now;
  const updatedAt = now;
  const nextRevision = (existing?.revision || 0) + 1;

  const statements: D1PreparedStatementLike[] = [];

  if (existing) {
    statements.push(
      db
        .prepare(
          `UPDATE workspaces SET
             name = ?,
             description = ?,
             dbml = ?,
             schema_files_json = ?,
             active_schema_file = ?,
             schema_folder = ?,
             table_positions_json = ?,
             group_meta_json = ?,
             sticky_notes_json = ?,
             detail_level = ?,
             github_link_json = ?,
             github_repo_link_json = ?,
             url_link_json = ?,
             revision = ?,
             updated_at = ?,
             deleted_at = NULL
           WHERE id = ? AND owner_user_id = ?`
        )
        .bind(
          name,
          description,
          dbml,
          schemaFilesJson,
          activeSchemaFile,
          schemaFolder,
          tablePositionsJson,
          groupMetaJson,
          stickyNotesJson,
          detailLevel,
          githubLinkJson,
          githubRepoLinkJson,
          urlLinkJson,
          nextRevision,
          updatedAt,
          workspaceId,
          userId
        )
    );
  } else {
    statements.push(
      db
        .prepare(
          `INSERT INTO workspaces (
             id, owner_user_id, name, description, dbml, schema_files_json,
             active_schema_file, schema_folder, table_positions_json,
             group_meta_json, sticky_notes_json, detail_level,
             github_link_json, github_repo_link_json, url_link_json,
             revision, created_at, updated_at, deleted_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
        )
        .bind(
          workspaceId,
          userId,
          name,
          description,
          dbml,
          schemaFilesJson,
          activeSchemaFile,
          schemaFolder,
          tablePositionsJson,
          groupMetaJson,
          stickyNotesJson,
          detailLevel,
          githubLinkJson,
          githubRepoLinkJson,
          urlLinkJson,
          nextRevision,
          createdAt,
          updatedAt
        )
    );
  }

  if (Array.isArray(body.versions)) {
    const incomingVersions = body.versions.slice(0, 100);
    const keepIds: string[] = [];

    for (const rawVersion of incomingVersions) {
      if (!isRecord(rawVersion)) continue;
      const v: IncomingVersionInput = rawVersion;
      const vid = typeof v.id === 'string' ? sanitizeId(v.id) : null;
      const tag =
        typeof v.tag === 'string' ? v.tag.trim().slice(0, 64) : '';
      const title =
        typeof v.title === 'string' ? v.title.trim().slice(0, 200) : '';
      if (!vid || !tag || !title) continue;
      keepIds.push(vid);

      const vDesc =
        typeof v.description === 'string' ? v.description.slice(0, 2000) : '';
      const vDbml = typeof v.dbml === 'string' ? v.dbml : '';
      const vPosJson = JSON.stringify(
        isRecord(v.tablePositions) ? v.tablePositions : {}
      );
      const vNotesJson = JSON.stringify(
        Array.isArray(v.stickyNotes) ? v.stickyNotes : []
      );
      const vCreatedAt =
        typeof v.createdAt === 'string' && v.createdAt ? v.createdAt : now;
      const vPublished = v.isPublished === false ? 0 : 1;

      statements.push(
        db
          .prepare(
            `INSERT INTO workspace_versions (
               id, workspace_id, owner_user_id, tag, title, description,
               dbml, table_positions_json, sticky_notes_json, is_published, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               tag = excluded.tag,
               title = excluded.title,
               description = excluded.description,
               dbml = excluded.dbml,
               table_positions_json = excluded.table_positions_json,
               sticky_notes_json = excluded.sticky_notes_json,
               is_published = excluded.is_published`
          )
          .bind(
            vid,
            workspaceId,
            userId,
            tag,
            title,
            vDesc,
            vDbml,
            vPosJson,
            vNotesJson,
            vPublished,
            vCreatedAt
          )
      );
    }

    if (keepIds.length === 0) {
      statements.push(
        db
          .prepare(
            `DELETE FROM workspace_versions WHERE workspace_id = ? AND owner_user_id = ?`
          )
          .bind(workspaceId, userId)
      );
    }
  }

  await db.batch(statements);

  return {
    ok: true,
    data: {
      ok: true,
      revision: nextRevision,
      syncedAt: updatedAt,
    },
  };
}

export async function softDeleteUserWorkspace(
  db: D1DatabaseLike,
  user: GithubUserSummary,
  rawWorkspaceId: string
): Promise<ServiceResult<{ ok: true }>> {
  const workspaceId = sanitizeId(rawWorkspaceId);
  if (!workspaceId) {
    return { ok: false, status: 400, error: 'Invalid workspace ID.' };
  }

  const userId = resolveUserId(user);
  const now = new Date().toISOString();

  await db.batch([
    db
      .prepare(
        `UPDATE workspaces SET deleted_at = ?, updated_at = ?
         WHERE id = ? AND owner_user_id = ?`
      )
      .bind(now, now, workspaceId, userId),
    db
      .prepare(
        `UPDATE share_links SET revoked_at = COALESCE(revoked_at, ?)
         WHERE workspace_id = ? AND owner_user_id = ?`
      )
      .bind(now, workspaceId, userId),
  ]);

  return { ok: true, data: { ok: true } };
}
