import { ValidationError } from '../../../../shared/domain/errors';
import type { GithubUserSummary } from '../../../domain/entities/types';
import {
  resolveUserId,
  sanitizeId,
} from '../../../domain/policies/userIdentityPolicy';
import type { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';

export async function executeDeleteWorkspace(deps: {
  workspaceRepository: IWorkspaceRepository;
  user: GithubUserSummary;
  rawWorkspaceId: string;
}): Promise<{ ok: true }> {
  const workspaceId = sanitizeId(deps.rawWorkspaceId);
  if (!workspaceId) {
    throw new ValidationError('Invalid workspace ID.');
  }

  const userId = resolveUserId(deps.user);
  const now = new Date().toISOString();

  await deps.workspaceRepository.softDeleteWithShares(workspaceId, userId, now);
  return { ok: true };
}
