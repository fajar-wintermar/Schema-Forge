import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../../shared/domain/errors';
import type { ShareLinkRecord } from '../../../../shared/domain/schemaTypes';
import { resolveShareExpirationInput } from '../../../../shared/domain/share/shareExpiration';
import type { GithubUserSummary } from '../../../domain/entities/types';
import {
  resolveUserId,
  sanitizeId,
} from '../../../domain/policies/userIdentityPolicy';
import type { IShareRepository } from '../../../domain/repositories/IShareRepository';
import type { ShareMutationPayload } from './createShareLink';

export async function executeUpdateShareLink(deps: {
  shareRepository: IShareRepository;
  user: GithubUserSummary;
  rawWorkspaceId: string;
  rawShareId: string;
  body: ShareMutationPayload;
}): Promise<ShareLinkRecord> {
  const { shareRepository, user, rawWorkspaceId, rawShareId, body } = deps;

  const workspaceId = sanitizeId(rawWorkspaceId);
  const shareId = sanitizeId(rawShareId);
  if (!workspaceId || !shareId) {
    throw new ValidationError('Invalid identifier.');
  }

  const userId = resolveUserId(user);
  const existing = await shareRepository.findByIdForWorkspace(
    shareId,
    workspaceId,
    userId
  );

  if (!existing) {
    throw new NotFoundError('Share link not found.');
  }
  if (existing.revokedAt) {
    throw new ConflictError('Revoked share links cannot be edited.');
  }

  let nextLabel = existing.label;
  if (Object.prototype.hasOwnProperty.call(body, 'label')) {
    if (typeof body.label !== 'string') {
      throw new ValidationError('Invalid share label.');
    }
    nextLabel = body.label.trim().slice(0, 120);
  }

  let nextDefaultView: 'docs' | 'diagram' = existing.defaultView;
  if (Object.prototype.hasOwnProperty.call(body, 'defaultView')) {
    if (body.defaultView !== 'docs' && body.defaultView !== 'diagram') {
      throw new ValidationError('Invalid default view.');
    }
    nextDefaultView = body.defaultView;
  }

  let nextAllowDiagramExport = existing.allowDiagramExport;
  if (Object.prototype.hasOwnProperty.call(body, 'allowDiagramExport')) {
    if (typeof body.allowDiagramExport !== 'boolean') {
      throw new ValidationError('Invalid diagram export setting.');
    }
    nextAllowDiagramExport = body.allowDiagramExport;
  }

  let nextPinnedVersionTag = existing.pinnedVersionTag;
  if (Object.prototype.hasOwnProperty.call(body, 'pinnedVersionTag')) {
    if (
      body.pinnedVersionTag === null ||
      (typeof body.pinnedVersionTag === 'string' &&
        !body.pinnedVersionTag.trim())
    ) {
      nextPinnedVersionTag = null;
    } else if (typeof body.pinnedVersionTag === 'string') {
      const requestedTag = body.pinnedVersionTag.trim().slice(0, 64);
      const verifiedTag = await shareRepository.versionTagExists(
        workspaceId,
        userId,
        requestedTag
      );
      if (!verifiedTag) {
        throw new ValidationError(
          `Version "${requestedTag}" has not been synced yet. Save & sync first.`
        );
      }
      nextPinnedVersionTag = verifiedTag;
    } else {
      throw new ValidationError('Invalid version tag.');
    }
  }

  const expirationResult = resolveShareExpirationInput(body);
  if (!expirationResult.ok) {
    throw new ValidationError(expirationResult.error);
  }
  const nextExpiresAt = expirationResult.provided
    ? expirationResult.value
    : existing.expiresAt;

  return shareRepository.updateShareLink({
    shareId,
    workspaceId,
    ownerUserId: userId,
    label: nextLabel,
    pinnedVersionTag: nextPinnedVersionTag,
    defaultView: nextDefaultView,
    allowDiagramExport: nextAllowDiagramExport,
    expiresAt: nextExpiresAt,
  });
}
