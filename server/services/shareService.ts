import type {
  SharedWorkspacePayload,
  ShareLinkRecord,
} from '../../src/types/schema';
import { parseDbml } from '../../src/utils/dbmlParser';
import type { D1DatabaseLike, GithubUserSummary } from '../types';
import { randomHex } from '../lib/crypto';
import {
  isGroupMetaMap,
  isStickyNoteArray,
  isTablePositionsMap,
  normalizeDetailLevel,
  resolveUserId,
  safeJsonParse,
  shareRowToClient,
  type ShareLinkRow,
  type WorkspaceRow,
  type WorkspaceVersionRow,
} from '../lib/dbHelpers';
import { sanitizeId, type ServiceResult } from '../lib/http';

const MAX_EXPIRY_MS = 3650 * 24 * 60 * 60 * 1000;

export interface ShareMutationPayload {
  label?: unknown;
  pinnedVersionTag?: unknown;
  defaultView?: unknown;
  allowDiagramExport?: unknown;
  expiresInDays?: unknown;
  expiresAt?: unknown;
}

function resolveExpirationInput(body: {
  expiresAt?: unknown;
  expiresInDays?: unknown;
}):
  | { ok: true; provided: boolean; value: string | null }
  | { ok: false; error: string } {
  const hasExpiresAt = Object.prototype.hasOwnProperty.call(body, 'expiresAt');
  const hasExpiresInDays = Object.prototype.hasOwnProperty.call(
    body,
    'expiresInDays'
  );

  if (!hasExpiresAt && !hasExpiresInDays) {
    return { ok: true, provided: false, value: null };
  }

  if (body.expiresAt !== undefined) {
    if (body.expiresAt === null || body.expiresAt === '') {
      return { ok: true, provided: true, value: null };
    }
    if (typeof body.expiresAt !== 'string') {
      return { ok: false, error: 'Invalid expiration date.' };
    }
    const parsedMs = Date.parse(body.expiresAt.trim());
    if (!Number.isFinite(parsedMs)) {
      return { ok: false, error: 'Invalid expiration date.' };
    }
    const nowMs = Date.now();
    if (parsedMs <= nowMs) {
      return { ok: false, error: 'Expiration date must be in the future.' };
    }
    if (parsedMs > nowMs + MAX_EXPIRY_MS) {
      return {
        ok: false,
        error: 'Expiration date cannot be more than 10 years in the future.',
      };
    }
    return { ok: true, provided: true, value: new Date(parsedMs).toISOString() };
  }

  if (body.expiresInDays === null) {
    return { ok: true, provided: true, value: null };
  }

  if (
    typeof body.expiresInDays === 'number' &&
    Number.isFinite(body.expiresInDays) &&
    body.expiresInDays > 0 &&
    body.expiresInDays <= 3650
  ) {
    return {
      ok: true,
      provided: true,
      value: new Date(
        Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000
      ).toISOString(),
    };
  }

  return {
    ok: false,
    error: 'Expiration days must be between 1 and 3650.',
  };
}

export async function listWorkspaceShares(
  db: D1DatabaseLike,
  user: GithubUserSummary,
  rawWorkspaceId: string
): Promise<ServiceResult<ShareLinkRecord[]>> {
  const workspaceId = sanitizeId(rawWorkspaceId);
  if (!workspaceId) {
    return { ok: false, status: 400, error: 'Invalid workspace ID.' };
  }

  const userId = resolveUserId(user);
  const ws = await db
    .prepare(
      `SELECT id FROM workspaces
       WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`
    )
    .bind(workspaceId, userId)
    .first<{ id: string }>();

  if (!ws) {
    return { ok: false, status: 404, error: 'Workspace not found in cloud.' };
  }

  const res = await db
    .prepare(
      `SELECT * FROM share_links
       WHERE workspace_id = ? AND owner_user_id = ? AND revoked_at IS NULL
       ORDER BY created_at DESC`
    )
    .bind(workspaceId, userId)
    .all<ShareLinkRow>();

  return {
    ok: true,
    data: res.results.map(shareRowToClient),
  };
}

export async function createWorkspaceShareLink(
  db: D1DatabaseLike,
  user: GithubUserSummary,
  rawWorkspaceId: string,
  body: ShareMutationPayload
): Promise<ServiceResult<ShareLinkRecord>> {
  const workspaceId = sanitizeId(rawWorkspaceId);
  if (!workspaceId) {
    return { ok: false, status: 400, error: 'Invalid workspace ID.' };
  }

  const userId = resolveUserId(user);
  const ws = await db
    .prepare(
      `SELECT id FROM workspaces
       WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`
    )
    .bind(workspaceId, userId)
    .first<{ id: string }>();

  if (!ws) {
    return {
      ok: false,
      status: 404,
      error: 'Sync this workspace to cloud before creating share links.',
    };
  }

  const label =
    typeof body.label === 'string' ? body.label.trim().slice(0, 120) : '';
  const defaultView: 'docs' | 'diagram' =
    body.defaultView === 'diagram' ? 'diagram' : 'docs';

  if (
    body.allowDiagramExport !== undefined &&
    typeof body.allowDiagramExport !== 'boolean'
  ) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid diagram export setting.',
    };
  }
  const allowDiagramExport = body.allowDiagramExport === true;

  let pinnedVersionTag: string | null = null;
  if (
    typeof body.pinnedVersionTag === 'string' &&
    body.pinnedVersionTag.trim()
  ) {
    const requestedTag = body.pinnedVersionTag.trim().slice(0, 64);
    const ver = await db
      .prepare(
        `SELECT tag FROM workspace_versions
         WHERE workspace_id = ? AND owner_user_id = ? AND tag = ?`
      )
      .bind(workspaceId, userId, requestedTag)
      .first<{ tag: string }>();
    if (!ver) {
      return {
        ok: false,
        status: 400,
        error: `Version "${requestedTag}" has not been synced yet. Save & sync first.`,
      };
    }
    pinnedVersionTag = ver.tag;
  }

  const expirationResult = resolveExpirationInput(body);
  if (!expirationResult.ok) {
    return { ok: false, status: 400, error: expirationResult.error };
  }
  const expiresAt = expirationResult.provided ? expirationResult.value : null;

  const id = `shr_${randomHex(8)}`;
  const token = `sf_${randomHex(10)}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO share_links (
         id, token, workspace_id, owner_user_id, label,
         pinned_version_tag, default_view, allow_diagram_export,
         created_by_login, created_at, expires_at, revoked_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
    )
    .bind(
      id,
      token,
      workspaceId,
      userId,
      label,
      pinnedVersionTag,
      defaultView,
      allowDiagramExport ? 1 : 0,
      user.login,
      now,
      expiresAt
    )
    .run();

  return {
    ok: true,
    data: {
      id,
      token,
      workspaceId,
      label,
      pinnedVersionTag,
      defaultView,
      allowDiagramExport,
      createdByLogin: user.login,
      createdAt: now,
      expiresAt,
      revokedAt: null,
    },
  };
}

export async function updateWorkspaceShareLink(
  db: D1DatabaseLike,
  user: GithubUserSummary,
  rawWorkspaceId: string,
  rawShareId: string,
  body: ShareMutationPayload
): Promise<ServiceResult<ShareLinkRecord>> {
  const workspaceId = sanitizeId(rawWorkspaceId);
  const shareId = sanitizeId(rawShareId);
  if (!workspaceId || !shareId) {
    return { ok: false, status: 400, error: 'Invalid identifier.' };
  }

  const userId = resolveUserId(user);
  const existing = await db
    .prepare(
      `SELECT * FROM share_links
       WHERE id = ? AND workspace_id = ? AND owner_user_id = ?`
    )
    .bind(shareId, workspaceId, userId)
    .first<ShareLinkRow>();

  if (!existing) {
    return { ok: false, status: 404, error: 'Share link not found.' };
  }
  if (existing.revoked_at) {
    return {
      ok: false,
      status: 409,
      error: 'Revoked share links cannot be edited.',
    };
  }

  let nextLabel = existing.label;
  if (Object.prototype.hasOwnProperty.call(body, 'label')) {
    if (typeof body.label !== 'string') {
      return { ok: false, status: 400, error: 'Invalid share label.' };
    }
    nextLabel = body.label.trim().slice(0, 120);
  }

  let nextDefaultView: 'docs' | 'diagram' =
    existing.default_view === 'diagram' ? 'diagram' : 'docs';
  if (Object.prototype.hasOwnProperty.call(body, 'defaultView')) {
    if (body.defaultView !== 'docs' && body.defaultView !== 'diagram') {
      return { ok: false, status: 400, error: 'Invalid default view.' };
    }
    nextDefaultView = body.defaultView;
  }

  let nextAllowDiagramExport = existing.allow_diagram_export ? 1 : 0;
  if (Object.prototype.hasOwnProperty.call(body, 'allowDiagramExport')) {
    if (typeof body.allowDiagramExport !== 'boolean') {
      return {
        ok: false,
        status: 400,
        error: 'Invalid diagram export setting.',
      };
    }
    nextAllowDiagramExport = body.allowDiagramExport ? 1 : 0;
  }

  let nextPinnedVersionTag = existing.pinned_version_tag;
  if (Object.prototype.hasOwnProperty.call(body, 'pinnedVersionTag')) {
    if (
      body.pinnedVersionTag === null ||
      (typeof body.pinnedVersionTag === 'string' &&
        !body.pinnedVersionTag.trim())
    ) {
      nextPinnedVersionTag = null;
    } else if (typeof body.pinnedVersionTag === 'string') {
      const requestedTag = body.pinnedVersionTag.trim().slice(0, 64);
      const ver = await db
        .prepare(
          `SELECT tag FROM workspace_versions
           WHERE workspace_id = ? AND owner_user_id = ? AND tag = ?`
        )
        .bind(workspaceId, userId, requestedTag)
        .first<{ tag: string }>();
      if (!ver) {
        return {
          ok: false,
          status: 400,
          error: `Version "${requestedTag}" has not been synced yet. Save & sync first.`,
        };
      }
      nextPinnedVersionTag = ver.tag;
    } else {
      return { ok: false, status: 400, error: 'Invalid version tag.' };
    }
  }

  const expirationResult = resolveExpirationInput(body);
  if (!expirationResult.ok) {
    return { ok: false, status: 400, error: expirationResult.error };
  }
  const nextExpiresAt = expirationResult.provided
    ? expirationResult.value
    : existing.expires_at;

  await db
    .prepare(
      `UPDATE share_links
       SET label = ?, pinned_version_tag = ?, default_view = ?, allow_diagram_export = ?, expires_at = ?
       WHERE id = ? AND workspace_id = ? AND owner_user_id = ?`
    )
    .bind(
      nextLabel,
      nextPinnedVersionTag,
      nextDefaultView,
      nextAllowDiagramExport,
      nextExpiresAt,
      shareId,
      workspaceId,
      userId
    )
    .run();

  const updatedRow: ShareLinkRow = {
    ...existing,
    label: nextLabel,
    pinned_version_tag: nextPinnedVersionTag,
    default_view: nextDefaultView,
    allow_diagram_export: nextAllowDiagramExport,
    expires_at: nextExpiresAt,
  };

  return {
    ok: true,
    data: shareRowToClient(updatedRow),
  };
}

export async function revokeWorkspaceShareLink(
  db: D1DatabaseLike,
  user: GithubUserSummary,
  rawWorkspaceId: string,
  rawShareId: string
): Promise<ServiceResult<{ ok: true; revokedAt: string }>> {
  const workspaceId = sanitizeId(rawWorkspaceId);
  const shareId = sanitizeId(rawShareId);
  if (!workspaceId || !shareId) {
    return { ok: false, status: 400, error: 'Invalid identifier.' };
  }

  const userId = resolveUserId(user);
  const now = new Date().toISOString();
  const res = await db
    .prepare(
      `UPDATE share_links SET revoked_at = COALESCE(revoked_at, ?)
       WHERE id = ? AND workspace_id = ? AND owner_user_id = ?`
    )
    .bind(now, shareId, workspaceId, userId)
    .run();

  if (!res.meta?.changes) {
    return { ok: false, status: 404, error: 'Share link not found.' };
  }

  return { ok: true, data: { ok: true, revokedAt: now } };
}

export async function resolvePublicShareLink(
  db: D1DatabaseLike,
  rawToken: string,
  requestedVersionTag?: string
): Promise<ServiceResult<SharedWorkspacePayload>> {
  const token = rawToken.trim();
  if (!token || !/^[a-zA-Z0-9_-]{8,64}$/.test(token)) {
    return { ok: false, status: 404, error: 'Invalid share link.' };
  }

  const share = await db
    .prepare(`SELECT * FROM share_links WHERE token = ?`)
    .bind(token)
    .first<ShareLinkRow>();

  if (!share || share.revoked_at) {
    return {
      ok: false,
      status: 404,
      error: 'This share link does not exist or has been revoked.',
    };
  }

  if (
    share.expires_at &&
    new Date(share.expires_at).getTime() <= Date.now()
  ) {
    return { ok: false, status: 410, error: 'This share link has expired.' };
  }

  const ws = await db
    .prepare(`SELECT * FROM workspaces WHERE id = ? AND deleted_at IS NULL`)
    .bind(share.workspace_id)
    .first<WorkspaceRow>();

  if (!ws) {
    return {
      ok: false,
      status: 404,
      error: 'Shared workspace is no longer available.',
    };
  }

  const pubVerRes = await db
    .prepare(
      `SELECT * FROM workspace_versions
       WHERE workspace_id = ? AND is_published = 1
       ORDER BY created_at DESC`
    )
    .bind(ws.id)
    .all<WorkspaceVersionRow>();

  let activeVersionTag: string | null = null;
  let dbml = ws.dbml;
  let tablePositions = safeJsonParse(
    ws.table_positions_json,
    {},
    isTablePositionsMap
  );
  let stickyNotes = safeJsonParse(
    ws.sticky_notes_json,
    [],
    isStickyNoteArray
  );

  if (share.pinned_version_tag) {
    const pinnedRow = await db
      .prepare(
        `SELECT * FROM workspace_versions
         WHERE workspace_id = ? AND tag = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(ws.id, share.pinned_version_tag)
      .first<WorkspaceVersionRow>();

    if (!pinnedRow) {
      return {
        ok: false,
        status: 404,
        error: `Pinned version ${share.pinned_version_tag} was not found.`,
      };
    }

    activeVersionTag = pinnedRow.tag;
    dbml = pinnedRow.dbml;
    tablePositions = safeJsonParse(
      pinnedRow.table_positions_json,
      {},
      isTablePositionsMap
    );
    stickyNotes = safeJsonParse(
      pinnedRow.sticky_notes_json,
      [],
      isStickyNoteArray
    );
  } else {
    const requestedTag = (requestedVersionTag || '').trim();
    if (requestedTag && requestedTag !== 'live') {
      const matched = pubVerRes.results.find((v) => v.tag === requestedTag);
      if (!matched) {
        return {
          ok: false,
          status: 404,
          error: `Published version "${requestedTag}" was not found.`,
        };
      }
      activeVersionTag = matched.tag;
      dbml = matched.dbml;
      tablePositions = safeJsonParse(
        matched.table_positions_json,
        {},
        isTablePositionsMap
      );
      stickyNotes = safeJsonParse(
        matched.sticky_notes_json,
        [],
        isStickyNoteArray
      );
    }
  }

  const parsedSchema = parseDbml(dbml);

  return {
    ok: true,
    data: {
      share: {
        id: share.id,
        token: share.token,
        label: share.label,
        pinnedVersionTag: share.pinned_version_tag,
        activeVersionTag,
        defaultView: share.default_view === 'diagram' ? 'diagram' : 'docs',
        allowDiagramExport: Boolean(share.allow_diagram_export),
        workspaceName: ws.name,
        workspaceDescription: ws.description,
        updatedAt: ws.updated_at,
        createdByLogin: share.created_by_login,
      },
      content: {
        parsedSchema,
        tablePositions,
        stickyNotes,
        detailLevel: normalizeDetailLevel(ws.detail_level),
        groupMeta: safeJsonParse(ws.group_meta_json, {}, isGroupMetaMap),
      },
      publishedVersions: share.pinned_version_tag
        ? []
        : pubVerRes.results.map((v) => ({
            id: v.id,
            tag: v.tag,
            title: v.title,
            description: v.description,
            createdAt: v.created_at,
          })),
    },
  };
}
