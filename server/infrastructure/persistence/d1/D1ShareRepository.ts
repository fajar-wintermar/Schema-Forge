import type { ShareLinkRecord } from '../../../../shared/domain/schemaTypes';
import type {
  CreateShareRecordInput,
  IShareRepository,
  ShareVersionSnapshot,
  ShareWorkspaceSnapshot,
  UpdateShareRecordInput,
} from '../../../domain/repositories/IShareRepository';
import {
  shareRowToClient,
  versionRowToShareSnapshot,
  workspaceRowToShareSnapshot,
  type ShareLinkRow,
  type WorkspaceRow,
  type WorkspaceVersionRow,
} from './d1Mappers';
import type { D1DatabaseLike } from './d1Types';

export class D1ShareRepository implements IShareRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async workspaceExistsForOwner(
    workspaceId: string,
    ownerUserId: string
  ): Promise<boolean> {
    const ws = await this.db
      .prepare(
        `SELECT id FROM workspaces
         WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`
      )
      .bind(workspaceId, ownerUserId)
      .first<{ id: string }>();
    return Boolean(ws);
  }

  async versionTagExists(
    workspaceId: string,
    ownerUserId: string,
    tag: string
  ): Promise<string | null> {
    const ver = await this.db
      .prepare(
        `SELECT tag FROM workspace_versions
         WHERE workspace_id = ? AND owner_user_id = ? AND tag = ?`
      )
      .bind(workspaceId, ownerUserId, tag)
      .first<{ tag: string }>();
    return ver?.tag ?? null;
  }

  async listActiveByWorkspace(
    workspaceId: string,
    ownerUserId: string
  ): Promise<ShareLinkRecord[]> {
    const res = await this.db
      .prepare(
        `SELECT * FROM share_links
         WHERE workspace_id = ? AND owner_user_id = ? AND revoked_at IS NULL
         ORDER BY created_at DESC`
      )
      .bind(workspaceId, ownerUserId)
      .all<ShareLinkRow>();
    return res.results.map(shareRowToClient);
  }

  async createShareLink(
    input: CreateShareRecordInput
  ): Promise<ShareLinkRecord> {
    await this.db
      .prepare(
        `INSERT INTO share_links (
           id, token, workspace_id, owner_user_id, label,
           pinned_version_tag, default_view, allow_diagram_export,
           created_by_login, created_at, expires_at, revoked_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`
      )
      .bind(
        input.id,
        input.token,
        input.workspaceId,
        input.ownerUserId,
        input.label,
        input.pinnedVersionTag,
        input.defaultView,
        input.allowDiagramExport ? 1 : 0,
        input.createdByLogin,
        input.createdAt,
        input.expiresAt
      )
      .run();

    return {
      id: input.id,
      token: input.token,
      workspaceId: input.workspaceId,
      label: input.label,
      pinnedVersionTag: input.pinnedVersionTag,
      defaultView: input.defaultView,
      allowDiagramExport: input.allowDiagramExport,
      createdByLogin: input.createdByLogin,
      createdAt: input.createdAt,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
  }

  async findByIdForWorkspace(
    shareId: string,
    workspaceId: string,
    ownerUserId: string
  ): Promise<ShareLinkRecord | null> {
    const existing = await this.db
      .prepare(
        `SELECT * FROM share_links
         WHERE id = ? AND workspace_id = ? AND owner_user_id = ?`
      )
      .bind(shareId, workspaceId, ownerUserId)
      .first<ShareLinkRow>();
    return existing ? shareRowToClient(existing) : null;
  }

  async updateShareLink(
    input: UpdateShareRecordInput
  ): Promise<ShareLinkRecord> {
    await this.db
      .prepare(
        `UPDATE share_links
         SET label = ?, pinned_version_tag = ?, default_view = ?, allow_diagram_export = ?, expires_at = ?
         WHERE id = ? AND workspace_id = ? AND owner_user_id = ?`
      )
      .bind(
        input.label,
        input.pinnedVersionTag,
        input.defaultView,
        input.allowDiagramExport ? 1 : 0,
        input.expiresAt,
        input.shareId,
        input.workspaceId,
        input.ownerUserId
      )
      .run();

    const updated = await this.db
      .prepare(
        `SELECT * FROM share_links
         WHERE id = ? AND workspace_id = ? AND owner_user_id = ?`
      )
      .bind(input.shareId, input.workspaceId, input.ownerUserId)
      .first<ShareLinkRow>();

    if (!updated) {
      throw new Error('Updated share link could not be reloaded.');
    }
    return shareRowToClient(updated);
  }

  async revokeShareLink(
    shareId: string,
    workspaceId: string,
    ownerUserId: string,
    revokedAt: string
  ): Promise<boolean> {
    const res = await this.db
      .prepare(
        `UPDATE share_links SET revoked_at = COALESCE(revoked_at, ?)
         WHERE id = ? AND workspace_id = ? AND owner_user_id = ?`
      )
      .bind(revokedAt, shareId, workspaceId, ownerUserId)
      .run();
    return Boolean(res.meta?.changes);
  }

  async findByToken(token: string): Promise<ShareLinkRecord | null> {
    const row = await this.db
      .prepare(`SELECT * FROM share_links WHERE token = ?`)
      .bind(token)
      .first<ShareLinkRow>();
    return row ? shareRowToClient(row) : null;
  }

  async findActiveWorkspaceById(
    workspaceId: string
  ): Promise<ShareWorkspaceSnapshot | null> {
    const ws = await this.db
      .prepare(`SELECT * FROM workspaces WHERE id = ? AND deleted_at IS NULL`)
      .bind(workspaceId)
      .first<WorkspaceRow>();
    return ws ? workspaceRowToShareSnapshot(ws) : null;
  }

  async listPublishedVersions(
    workspaceId: string
  ): Promise<ShareVersionSnapshot[]> {
    const pubVerRes = await this.db
      .prepare(
        `SELECT * FROM workspace_versions
         WHERE workspace_id = ? AND is_published = 1
         ORDER BY created_at DESC`
      )
      .bind(workspaceId)
      .all<WorkspaceVersionRow>();
    return pubVerRes.results.map(versionRowToShareSnapshot);
  }

  async findPinnedVersion(
    workspaceId: string,
    tag: string
  ): Promise<ShareVersionSnapshot | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM workspace_versions
         WHERE workspace_id = ? AND tag = ?
         ORDER BY created_at DESC LIMIT 1`
      )
      .bind(workspaceId, tag)
      .first<WorkspaceVersionRow>();
    return row ? versionRowToShareSnapshot(row) : null;
  }
}
