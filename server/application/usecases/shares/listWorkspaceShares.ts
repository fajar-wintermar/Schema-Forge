import { NotFoundError, ValidationError } from '../../../../shared/domain/errors';
import type { ShareLinkRecord } from '../../../../shared/domain/schemaTypes';
import type { GithubUserSummary } from '../../../domain/entities/types';
import {
  resolveUserId,
  sanitizeId,
} from '../../../domain/policies/userIdentityPolicy';
import type { IShareRepository } from '../../../domain/repositories/IShareRepository';

export async function executeListWorkspaceShares(deps: {
  shareRepository: IShareRepository;
  user: GithubUserSummary;
  rawWorkspaceId: string;
}): Promise<ShareLinkRecord[]> {
  const workspaceId = sanitizeId(deps.rawWorkspaceId);
  if (!workspaceId) {
    throw new ValidationError('Invalid workspace ID.');
  }

  const userId = resolveUserId(deps.user);
  const exists = await deps.shareRepository.workspaceExistsForOwner(
    workspaceId,
    userId
  );
  if (!exists) {
    throw new NotFoundError('Workspace not found in cloud.');
  }

  return deps.shareRepository.listActiveByWorkspace(workspaceId, userId);
}
