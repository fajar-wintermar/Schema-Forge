import { Hono } from 'hono';
import type { ApiContext, AppEnv } from '../types';
import {
  getGithubSession,
  randomHex,
  verifyMutatingRequestOrigin,
} from '../lib/crypto';
import {
  resolveUserId,
  safeJsonParse,
  shareRowToClient,
  type ShareLinkRow,
  type WorkspaceRow,
  type WorkspaceVersionRow,
} from '../lib/dbHelpers';
import { parseDbml } from '../../src/utils/dbmlParser';

export const shareRoutes = new Hono<{ Bindings: AppEnv }>();

function sanitizeId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 100) return null;
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) return null;
  return trimmed;
}

// List share links for a workspace (owner only)
shareRoutes.get('/api/workspaces/:id/shares', async (c) => {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'Cloud database (D1) is not configured.' }, 503);
  }
  const session = await getGithubSession(c);
  if (!session) {
    return c.json({ error: 'Authentication required.' }, 401);
  }

  const workspaceId = sanitizeId(c.req.param('id'));
  if (!workspaceId) {
    return c.json({ error: 'Invalid workspace ID.' }, 400);
  }

  const userId = resolveUserId(session.user);
  const ws = await db
    .prepare(
      `SELECT id FROM workspaces
       WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`
    )
    .bind(workspaceId, userId)
    .first<{ id: string }>();

  if (!ws) {
    return c.json({ error: 'Workspace not found in cloud.' }, 404);
  }

  const res = await db
    .prepare(
      `SELECT * FROM share_links
       WHERE workspace_id = ? AND owner_user_id = ?
       ORDER BY created_at DESC`
    )
    .bind(workspaceId, userId)
    .all<ShareLinkRow>();

  return c.json({
    shares: res.results.map(shareRowToClient),
  });
});

const MAX_EXPIRY_MS = 3650 * 24 * 60 * 60 * 1000;

function resolveExpirationInput(body: {
  expiresAt?: unknown;
  expiresInDays?: unknown;
}): { ok: true; provided: boolean; value: string | null } | { ok: false; error: string } {
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

// Create a shareable read-only link (owner only)
shareRoutes.post('/api/workspaces/:id/shares', async (c) => {
  if (!verifyMutatingRequestOrigin(c)) {
    return c.json({ error: 'Invalid request origin.' }, 403);
  }
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'Cloud database (D1) is not configured.' }, 503);
  }
  const session = await getGithubSession(c);
  if (!session) {
    return c.json({ error: 'Authentication required.' }, 401);
  }

  const workspaceId = sanitizeId(c.req.param('id'));
  if (!workspaceId) {
    return c.json({ error: 'Invalid workspace ID.' }, 400);
  }

  const userId = resolveUserId(session.user);
  const ws = await db
    .prepare(
      `SELECT id FROM workspaces
       WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`
    )
    .bind(workspaceId, userId)
    .first<{ id: string }>();

  if (!ws) {
    return c.json(
      { error: 'Sync this workspace to cloud before creating share links.' },
      404
    );
  }

  const body = await c.req
    .json<{
      label?: unknown;
      pinnedVersionTag?: unknown;
      defaultView?: unknown;
      allowDiagramExport?: unknown;
      expiresInDays?: unknown;
      expiresAt?: unknown;
    }>()
    .catch(() => ({} as Record<string, unknown>));

  const label =
    typeof body.label === 'string' ? body.label.trim().slice(0, 120) : '';
  const defaultView =
    body.defaultView === 'diagram' ? 'diagram' : 'docs';
  if (
    body.allowDiagramExport !== undefined &&
    typeof body.allowDiagramExport !== 'boolean'
  ) {
    return c.json({ error: 'Invalid diagram export setting.' }, 400);
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
      return c.json(
        {
          error: `Version "${requestedTag}" has not been synced yet. Save & sync first.`,
        },
        400
      );
    }
    pinnedVersionTag = ver.tag;
  }

  const expirationResult = resolveExpirationInput(body);
  if (expirationResult.ok === false) {
    return c.json({ error: expirationResult.error }, 400);
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
      session.user.login,
      now,
      expiresAt
    )
    .run();

  return c.json({
    share: {
      id,
      token,
      workspaceId,
      label,
      pinnedVersionTag,
      defaultView,
      allowDiagramExport,
      createdByLogin: session.user.login,
      createdAt: now,
      expiresAt,
      revokedAt: null,
    },
  });
});

// Update an existing share link's version target, expiration, label, or landing view (owner only)
shareRoutes.patch('/api/workspaces/:id/shares/:shareId', async (c) => {
  if (!verifyMutatingRequestOrigin(c)) {
    return c.json({ error: 'Invalid request origin.' }, 403);
  }
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'Cloud database (D1) is not configured.' }, 503);
  }
  const session = await getGithubSession(c);
  if (!session) {
    return c.json({ error: 'Authentication required.' }, 401);
  }

  const workspaceId = sanitizeId(c.req.param('id'));
  const shareId = sanitizeId(c.req.param('shareId'));
  if (!workspaceId || !shareId) {
    return c.json({ error: 'Invalid identifier.' }, 400);
  }

  const userId = resolveUserId(session.user);
  const existing = await db
    .prepare(
      `SELECT * FROM share_links
       WHERE id = ? AND workspace_id = ? AND owner_user_id = ?`
    )
    .bind(shareId, workspaceId, userId)
    .first<ShareLinkRow>();

  if (!existing) {
    return c.json({ error: 'Share link not found.' }, 404);
  }
  if (existing.revoked_at) {
    return c.json(
      { error: 'Revoked share links cannot be edited.' },
      409
    );
  }

  const body = await c.req
    .json<{
      label?: unknown;
      pinnedVersionTag?: unknown;
      defaultView?: unknown;
      allowDiagramExport?: unknown;
      expiresInDays?: unknown;
      expiresAt?: unknown;
    }>()
    .catch(() => null);

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'Invalid JSON payload.' }, 400);
  }

  let nextLabel = existing.label;
  if (Object.prototype.hasOwnProperty.call(body, 'label')) {
    if (typeof body.label !== 'string') {
      return c.json({ error: 'Invalid share label.' }, 400);
    }
    nextLabel = body.label.trim().slice(0, 120);
  }

  let nextDefaultView = existing.default_view === 'diagram' ? 'diagram' : 'docs';
  if (Object.prototype.hasOwnProperty.call(body, 'defaultView')) {
    if (body.defaultView !== 'docs' && body.defaultView !== 'diagram') {
      return c.json({ error: 'Invalid default view.' }, 400);
    }
    nextDefaultView = body.defaultView;
  }

  let nextAllowDiagramExport = existing.allow_diagram_export ? 1 : 0;
  if (Object.prototype.hasOwnProperty.call(body, 'allowDiagramExport')) {
    if (typeof body.allowDiagramExport !== 'boolean') {
      return c.json({ error: 'Invalid diagram export setting.' }, 400);
    }
    nextAllowDiagramExport = body.allowDiagramExport ? 1 : 0;
  }

  let nextPinnedVersionTag = existing.pinned_version_tag;
  if (Object.prototype.hasOwnProperty.call(body, 'pinnedVersionTag')) {
    if (
      body.pinnedVersionTag === null ||
      (typeof body.pinnedVersionTag === 'string' && !body.pinnedVersionTag.trim())
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
        return c.json(
          {
            error: `Version "${requestedTag}" has not been synced yet. Save & sync first.`,
          },
          400
        );
      }
      nextPinnedVersionTag = ver.tag;
    } else {
      return c.json({ error: 'Invalid version tag.' }, 400);
    }
  }

  const expirationResult = resolveExpirationInput(body);
  if (expirationResult.ok === false) {
    return c.json({ error: expirationResult.error }, 400);
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

  return c.json({
    share: shareRowToClient(updatedRow),
  });
});

// Revoke a share link (owner only)
shareRoutes.delete('/api/workspaces/:id/shares/:shareId', async (c) => {
  if (!verifyMutatingRequestOrigin(c)) {
    return c.json({ error: 'Invalid request origin.' }, 403);
  }
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'Cloud database (D1) is not configured.' }, 503);
  }
  const session = await getGithubSession(c);
  if (!session) {
    return c.json({ error: 'Authentication required.' }, 401);
  }

  const workspaceId = sanitizeId(c.req.param('id'));
  const shareId = sanitizeId(c.req.param('shareId'));
  if (!workspaceId || !shareId) {
    return c.json({ error: 'Invalid identifier.' }, 400);
  }

  const userId = resolveUserId(session.user);
  const now = new Date().toISOString();
  const res = await db
    .prepare(
      `UPDATE share_links SET revoked_at = COALESCE(revoked_at, ?)
       WHERE id = ? AND workspace_id = ? AND owner_user_id = ?`
    )
    .bind(now, shareId, workspaceId, userId)
    .run();

  if (!res.meta?.changes) {
    return c.json({ error: 'Share link not found.' }, 404);
  }

  return c.json({ ok: true, revokedAt: now });
});

// Public Read-Only Share Resolution (no auth required)
async function handleResolvePublicShare(c: ApiContext, versionParam?: string) {
  const db = c.env?.DB;
  if (!db) {
    return c.json({ error: 'Cloud sharing service is not configured.' }, 503);
  }

  const token = (c.req.param('token') || '').trim();
  if (!token || !/^[a-zA-Z0-9_-]{8,64}$/.test(token)) {
    return c.json({ error: 'Invalid share link.' }, 404);
  }

  const share = await db
    .prepare(`SELECT * FROM share_links WHERE token = ?`)
    .bind(token)
    .first<ShareLinkRow>();

  if (!share || share.revoked_at) {
    return c.json(
      { error: 'This share link does not exist or has been revoked.' },
      404
    );
  }

  if (share.expires_at && new Date(share.expires_at).getTime() <= Date.now()) {
    return c.json({ error: 'This share link has expired.' }, 410);
  }

  const ws = await db
    .prepare(
      `SELECT * FROM workspaces WHERE id = ? AND deleted_at IS NULL`
    )
    .bind(share.workspace_id)
    .first<WorkspaceRow>();

  if (!ws) {
    return c.json({ error: 'Shared workspace is no longer available.' }, 404);
  }

  // Only list published versions publicly
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
  let tablePositions = safeJsonParse<Record<string, { x: number; y: number }>>(
    ws.table_positions_json,
    {}
  );
  let stickyNotes = safeJsonParse<unknown[]>(ws.sticky_notes_json, []);

  // If link is pinned to a specific version tag, lock strictly to that version
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
      return c.json(
        { error: `Pinned version ${share.pinned_version_tag} was not found.` },
        404
      );
    }

    activeVersionTag = pinnedRow.tag;
    dbml = pinnedRow.dbml;
    tablePositions = safeJsonParse(pinnedRow.table_positions_json, {});
    stickyNotes = safeJsonParse(pinnedRow.sticky_notes_json, []);
  } else {
    const requestedTag = (versionParam || c.req.query('v') || '').trim();
    if (requestedTag && requestedTag !== 'live') {
      const matched = pubVerRes.results.find((v) => v.tag === requestedTag);
      if (!matched) {
        return c.json(
          { error: `Published version "${requestedTag}" was not found.` },
          404
        );
      }
      activeVersionTag = matched.tag;
      dbml = matched.dbml;
      tablePositions = safeJsonParse(matched.table_positions_json, {});
      stickyNotes = safeJsonParse(matched.sticky_notes_json, []);
    }
  }

  const parsedSchema = parseDbml(dbml);

  return c.json({
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
      detailLevel:
        ws.detail_level === 'columns' ||
        ws.detail_level === 'keys' ||
        ws.detail_level === 'names'
          ? ws.detail_level
          : 'full',
      groupMeta: safeJsonParse(ws.group_meta_json, {}),
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
  });
}

shareRoutes.get('/api/share/:token', (c) => handleResolvePublicShare(c));
shareRoutes.get('/api/share/:token/:versionTag', (c) =>
  handleResolvePublicShare(c, decodeURIComponent(c.req.param('versionTag')))
);
