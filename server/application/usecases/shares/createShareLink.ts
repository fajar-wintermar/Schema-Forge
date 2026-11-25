import { NotFoundError, ValidationError } from '../../../../shared/domain/errors';
import type { ShareLinkRecord } from '../../../../shared/domain/schemaTypes';
import { resolveShareExpirationInput } from '../../../../shared/domain/share/shareExpiration';
import type { GithubUserSummary } from '../../../domain/entities/types';
import type { ITokenCipher } from '../../../domain/gateways/ITokenCipher';
import {
  resolveUserId,
  sanitizeId,
} from '../../../domain/policies/userIdentityPolicy';
import type { IShareRepository } from '../../../domain/repositories/IShareRepository';

export interface ShareMutationPayload {
  label?: unknown;
  pinnedVersionTag?: unknown;
  defaultView?: unknown;
  allowDiagramExport?: unknown;
  expiresInDays?: unknown;
  expiresAt?: unknown;
}

export async function executeCreateShareLink(deps: {
  shareRepository: IShareRepository;
  tokenCipher: ITokenCipher;
  user: GithubUserSummary;
  rawWorkspaceId: string;
  body: ShareMutationPayload;
}): Promise<ShareLinkRecord> {
  const { shareRepository, tokenCipher, user, rawWorkspaceId, body } = deps;

  const workspaceId = sanitizeId(rawWorkspaceId);
  if (!workspaceId) {
    throw new ValidationError('Invalid workspace ID.');
  }

  const userId = resolveUserId(user);
  const exists = await shareRepository.workspaceExistsForOwner(
    workspaceId,
    userId
  );
  if (!exists) {
    throw new NotFoundError(
      'Sync this workspace to cloud before creating share links.'
    );
  }

  const label =
    typeof body.label === 'string' ? body.label.trim().slice(0, 120) : '';
  const defaultView: 'docs' | 'diagram' =
    body.defaultView === 'diagram' ? 'diagram' : 'docs';

  if (
    body.allowDiagramExport !== undefined &&
    typeof body.allowDiagramExport !== 'boolean'
  ) {
    throw new ValidationError('Invalid diagram export setting.');
  }
  const allowDiagramExport = body.allowDiagramExport === true;

  let pinnedVersionTag: string | null = null;
  if (
    typeof body.pinnedVersionTag === 'string' &&
    body.pinnedVersionTag.trim()
  ) {
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
    pinnedVersionTag = verifiedTag;
  }

  const expirationResult = resolveShareExpirationInput(body);
  if (!expirationResult.ok) {
    throw new ValidationError(expirationResult.error);
  }
  const expiresAt = expirationResult.provided ? expirationResult.value : null;

  const id = `shr_${tokenCipher.randomHex(8)}`;
  const token = `sf_${tokenCipher.randomHex(10)}`;
  const now = new Date().toISOString();

  return shareRepository.createShareLink({
    id,
    token,
    workspaceId,
    ownerUserId: userId,
    label,
    pinnedVersionTag,
    defaultView,
    allowDiagramExport,
    createdByLogin: user.login,
    createdAt: now,
    expiresAt,
  });
}
