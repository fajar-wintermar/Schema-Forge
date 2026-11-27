import type { WorkspaceProject } from '../../../../shared/domain/schemaTypes';
import type {
  IWorkspaceRepository,
  UpsertWorkspaceRecordInput,
  WorkspaceOwnershipMetadata,
} from '../../../domain/repositories/IWorkspaceRepository';
import {
  workspaceRowToClient,
  type WorkspaceRow,
  type WorkspaceVersionRow,
} from './d1Mappers';
import type { D1DatabaseLike, D1PreparedStatementLike } from './d1Types';

export class D1WorkspaceRepository implements IWorkspaceRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async listByOwner(ownerUserId: string): Promise<WorkspaceProject[]> {
    const wsResult = await this.db
      .prepare(
        `SELECT * FROM workspaces
         WHERE owner_user_id = ? AND deleted_at IS NULL
         ORDER BY updated_at DESC`
      )
      .bind(ownerUserId)
      .all<WorkspaceRow>();

    const verResult = await this.db
      .prepare(
        `SELECT * FROM workspace_versions
         WHERE owner_user_id = ?
         ORDER BY created_at DESC`
      )
      .bind(ownerUserId)
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

  async findByIdForOwner(
    workspaceId: string,
    ownerUserId: string
  ): Promise<WorkspaceProject | null> {
    const row = await this.db
      .prepare(
        `SELECT * FROM workspaces
         WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`
      )
      .bind(workspaceId, ownerUserId)
      .first<WorkspaceRow>();

    if (!row) return null;

    const verResult = await this.db
      .prepare(
        `SELECT * FROM workspace_versions
         WHERE workspace_id = ? AND owner_user_id = ?
         ORDER BY created_at DESC`
      )
      .bind(workspaceId, ownerUserId)
      .all<WorkspaceVersionRow>();

    return workspaceRowToClient(row, verResult.results);
  }

  async findMetadataById(
    workspaceId: string
  ): Promise<WorkspaceOwnershipMetadata | null> {
    const existing = await this.db
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

    if (!existing) return null;
    return {
      id: existing.id,
      ownerUserId: existing.owner_user_id,
      revision: existing.revision,
      createdAt: existing.created_at,
    };
  }

  async upsertWithVersions(input: UpsertWorkspaceRecordInput): Promise<void> {
    const statements: D1PreparedStatementLike[] = [];

    if (input.exists) {
      statements.push(
        this.db
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
            input.name,
            input.description,
            input.dbml,
            input.schemaFilesJson,
            input.activeSchemaFile,
            input.schemaFolder,
            input.tablePositionsJson,
            input.groupMetaJson,
            input.stickyNotesJson,
            input.detailLevel,
            input.githubLinkJson,
            input.githubRepoLinkJson,
            input.urlLinkJson,
            input.revision,
            input.updatedAt,
            input.workspaceId,
            input.ownerUserId
          )
      );
    } else {
      statements.push(
        this.db
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
            input.workspaceId,
            input.ownerUserId,
            input.name,
            input.description,
            input.dbml,
            input.schemaFilesJson,
            input.activeSchemaFile,
            input.schemaFolder,
            input.tablePositionsJson,
            input.groupMetaJson,
            input.stickyNotesJson,
            input.detailLevel,
            input.githubLinkJson,
            input.githubRepoLinkJson,
            input.urlLinkJson,
            input.revision,
            input.createdAt,
            input.updatedAt
          )
      );
    }

    if (input.clearAllVersions) {
      statements.push(
        this.db
          .prepare(
            `DELETE FROM workspace_versions WHERE workspace_id = ? AND owner_user_id = ?`
          )
          .bind(input.workspaceId, input.ownerUserId)
      );
    } else if (input.versions && input.versions.length > 0) {
      // Pass the kept IDs as one JSON array parameter. Cloudflare D1 allows at
      // most 100 bound parameters per statement, and a workspace may hold up
      // to 100 versions, so one placeholder per ID would exceed the limit.
      const keepIdsJson = JSON.stringify(input.versions.map((v) => v.id));
      statements.push(
        this.db
          .prepare(
            `DELETE FROM workspace_versions
             WHERE workspace_id = ? AND owner_user_id = ?
               AND id NOT IN (SELECT value FROM json_each(?))`
          )
          .bind(input.workspaceId, input.ownerUserId, keepIdsJson)
      );

      for (const v of input.versions) {
        statements.push(
          this.db
            .prepare(
              `INSERT INTO workspace_versions (
                 id, workspace_id, owner_user_id, tag, title, description,
                 dbml, table_positions_json, sticky_notes_json, is_published, created_at
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(workspace_id, id) DO UPDATE SET
                 tag = excluded.tag,
                 title = excluded.title,
                 description = excluded.description,
                 dbml = excluded.dbml,
                 table_positions_json = excluded.table_positions_json,
                 sticky_notes_json = excluded.sticky_notes_json,
                 is_published = excluded.is_published
               WHERE workspace_versions.owner_user_id = excluded.owner_user_id
                 AND workspace_versions.workspace_id = excluded.workspace_id`
            )
            .bind(
              v.id,
              input.workspaceId,
              input.ownerUserId,
              v.tag,
              v.title,
              v.description,
              v.dbml,
              v.tablePositionsJson,
              v.stickyNotesJson,
              v.isPublished ? 1 : 0,
              v.createdAt
            )
        );
      }
    }

    await this.db.batch(statements);
  }

  async softDeleteWithShares(
    workspaceId: string,
    ownerUserId: string,
    nowIso: string
  ): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE workspaces SET deleted_at = ?, updated_at = ?
           WHERE id = ? AND owner_user_id = ?`
        )
        .bind(nowIso, nowIso, workspaceId, ownerUserId),
      this.db
        .prepare(
          `UPDATE share_links SET revoked_at = COALESCE(revoked_at, ?)
           WHERE workspace_id = ? AND owner_user_id = ?`
        )
        .bind(nowIso, workspaceId, ownerUserId),
    ]);
  }
}
