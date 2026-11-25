import { NotFoundError, ValidationError } from '../../../../shared/domain/errors';
import type { GithubUserSummary } from '../../../domain/entities/types';
import {
  resolveUserId,
  sanitizeId,
} from '../../../domain/policies/userIdentityPolicy';
import type { IShareRepository } from '../../../domain/repositories/IShareRepository';

export async function executeRevokeShareLink(deps: {
  shareRepository: IShareRepository;
  user: GithubUserSummary;
  rawWorkspaceId: string;
  rawShareId: string;
}): Promise<{ ok: true; revokedAt: string }> {
  const workspaceId = sanitizeId(deps.rawWorkspaceId);
  const shareId = sanitizeId(deps.rawShareId);
  if (!workspaceId || !shareId) {
    throw new ValidationError('Invalid identifier.');
  }

  const userId = resolveUserId(deps.user);
  const now = new Date().toISOString();
  const revoked = await deps.shareRepository.revokeShareLink(
    shareId,
    workspaceId,
    userId,
    now
  );

  if (!revoked) {
    throw new NotFoundError('Share link not found.');
  }

  return { ok: true, revokedAt: now };
}
