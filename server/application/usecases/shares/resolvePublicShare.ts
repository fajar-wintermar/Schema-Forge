import { parseDbml } from '../../../../shared/domain/dbml';
import { ExpiredError, NotFoundError } from '../../../../shared/domain/errors';
import type { SharedWorkspacePayload } from '../../../../shared/domain/schemaTypes';
import type { IShareRepository } from '../../../domain/repositories/IShareRepository';

export async function executeResolvePublicShare(deps: {
  shareRepository: IShareRepository;
  rawToken: string;
  requestedVersionTag?: string;
}): Promise<SharedWorkspacePayload> {
  const token = deps.rawToken.trim();
  if (!token || !/^[a-zA-Z0-9_-]{8,64}$/.test(token)) {
    throw new NotFoundError('Invalid share link.');
  }

  const share = await deps.shareRepository.findByToken(token);
  if (!share || share.revokedAt) {
    throw new NotFoundError(
      'This share link does not exist or has been revoked.'
    );
  }

  if (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()) {
    throw new ExpiredError('This share link has expired.');
  }

  const ws = await deps.shareRepository.findActiveWorkspaceById(
    share.workspaceId
  );
  if (!ws) {
    throw new NotFoundError('Shared workspace is no longer available.');
  }

  const publishedVersions = await deps.shareRepository.listPublishedVersions(
    ws.id
  );

  let activeVersionTag: string | null = null;
  let dbml = ws.dbml;
  let tablePositions = ws.tablePositions;
  let stickyNotes = ws.stickyNotes;

  if (share.pinnedVersionTag) {
    const pinnedRow = await deps.shareRepository.findPinnedVersion(
      ws.id,
      share.pinnedVersionTag
    );
    if (!pinnedRow) {
      throw new NotFoundError(
        `Pinned version ${share.pinnedVersionTag} was not found.`
      );
    }
    activeVersionTag = pinnedRow.tag;
    dbml = pinnedRow.dbml;
    tablePositions = pinnedRow.tablePositions;
    stickyNotes = pinnedRow.stickyNotes;
  } else {
    const requestedTag = (deps.requestedVersionTag || '').trim();
    if (requestedTag && requestedTag !== 'live') {
      const matched = publishedVersions.find((v) => v.tag === requestedTag);
      if (!matched) {
        throw new NotFoundError(
          `Published version "${requestedTag}" was not found.`
        );
      }
      activeVersionTag = matched.tag;
      dbml = matched.dbml;
      tablePositions = matched.tablePositions;
      stickyNotes = matched.stickyNotes;
    }
  }

  const parsedSchema = parseDbml(dbml);

  return {
    share: {
      id: share.id,
      token: share.token,
      label: share.label,
      pinnedVersionTag: share.pinnedVersionTag,
      activeVersionTag,
      defaultView: share.defaultView,
      allowDiagramExport: share.allowDiagramExport,
      workspaceName: ws.name,
      workspaceDescription: ws.description,
      updatedAt: ws.updatedAt,
      createdByLogin: share.createdByLogin,
    },
    content: {
      parsedSchema,
      tablePositions,
      stickyNotes,
      detailLevel: ws.detailLevel,
      groupMeta: ws.groupMeta,
    },
    publishedVersions: share.pinnedVersionTag
      ? []
      : publishedVersions.map((v) => ({
          id: v.id,
          tag: v.tag,
          title: v.title,
          description: v.description,
          createdAt: v.createdAt,
        })),
  };
}
