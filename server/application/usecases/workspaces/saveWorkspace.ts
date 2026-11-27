import {
  ConflictError,
  ForbiddenError,
  PayloadTooLargeError,
  ValidationError,
} from '../../../../shared/domain/errors';
import type { GithubUserSummary } from '../../../domain/entities/types';
import { isRecord } from '../../../domain/policies/typeGuards';
import {
  resolveUserId,
  sanitizeId,
} from '../../../domain/policies/userIdentityPolicy';
import type { IUserRepository } from '../../../domain/repositories/IUserRepository';
import type {
  IWorkspaceRepository,
  UpsertWorkspaceVersionRecord,
} from '../../../domain/repositories/IWorkspaceRepository';

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
  cloudRevision?: unknown;
}

export async function executeSaveWorkspace(deps: {
  workspaceRepository: IWorkspaceRepository;
  userRepository: IUserRepository;
  user: GithubUserSummary;
  rawWorkspaceId: string;
  body: IncomingWorkspaceInput;
}): Promise<{ ok: true; revision: number; syncedAt: string }> {
  const { workspaceRepository, userRepository, user, rawWorkspaceId, body } =
    deps;

  const workspaceId = sanitizeId(rawWorkspaceId);
  if (!workspaceId) {
    throw new ValidationError('Invalid workspace ID.');
  }

  const name =
    typeof body.name === 'string' ? body.name.trim().slice(0, 140) : '';
  if (!name) {
    throw new ValidationError('Workspace name is required.');
  }

  const dbml = typeof body.dbml === 'string' ? body.dbml : '';
  if (dbml.length > 4 * 1024 * 1024) {
    throw new PayloadTooLargeError('Schema exceeds 4 MB cloud limit.');
  }

  const userId = resolveUserId(user);
  await userRepository.upsertCloudUser(user);

  const existing = await workspaceRepository.findMetadataById(workspaceId);
  if (existing && existing.ownerUserId !== userId) {
    throw new ForbiddenError(
      'You do not have permission to modify this workspace.'
    );
  }

  if (existing && body.cloudRevision !== undefined) {
    if (
      typeof body.cloudRevision !== 'number' ||
      !Number.isFinite(body.cloudRevision) ||
      body.cloudRevision < 0
    ) {
      throw new ValidationError('Invalid cloudRevision value.');
    }
    if (body.cloudRevision !== existing.revision) {
      throw new ConflictError(
        'This workspace was modified in another session. Refresh cloud changes before saving.',
        { code: 'REVISION_CONFLICT' }
      );
    }
  }

  const now = new Date().toISOString();
  const description =
    typeof body.description === 'string' ? body.description.slice(0, 500) : '';
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
    existing?.createdAt ||
    (typeof body.createdAt === 'string' && body.createdAt) ||
    now;
  const updatedAt = now;
  const nextRevision = (existing?.revision || 0) + 1;

  const versions: UpsertWorkspaceVersionRecord[] = [];
  let clearAllVersions = false;

  if (Array.isArray(body.versions)) {
    const incomingVersions = body.versions.slice(0, 100);
    for (const rawVersion of incomingVersions) {
      if (!isRecord(rawVersion)) continue;
      const v: IncomingVersionInput = rawVersion;
      const vid = typeof v.id === 'string' ? sanitizeId(v.id) : null;
      const tag = typeof v.tag === 'string' ? v.tag.trim().slice(0, 64) : '';
      const title =
        typeof v.title === 'string' ? v.title.trim().slice(0, 200) : '';
      if (!vid || !tag || !title) continue;

      versions.push({
        id: vid,
        tag,
        title,
        description:
          typeof v.description === 'string' ? v.description.slice(0, 2000) : '',
        dbml: typeof v.dbml === 'string' ? v.dbml : '',
        tablePositionsJson: JSON.stringify(
          isRecord(v.tablePositions) ? v.tablePositions : {}
        ),
        stickyNotesJson: JSON.stringify(
          Array.isArray(v.stickyNotes) ? v.stickyNotes : []
        ),
        isPublished: v.isPublished !== false,
        createdAt:
          typeof v.createdAt === 'string' && v.createdAt ? v.createdAt : now,
      });
    }

    if (body.versions.length === 0) {
      clearAllVersions = true;
    } else if (versions.length !== incomingVersions.length) {
      throw new ValidationError(
        'One or more workspace versions are invalid (missing id, tag, or title).'
      );
    }
  }

  await workspaceRepository.upsertWithVersions({
    workspaceId,
    ownerUserId: userId,
    exists: Boolean(existing),
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
    revision: nextRevision,
    createdAt,
    updatedAt,
    versions,
    clearAllVersions,
  });

  return {
    ok: true,
    revision: nextRevision,
    syncedAt: updatedAt,
  };
}
