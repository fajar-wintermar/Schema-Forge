import { NotFoundError, ValidationError } from '../../../../shared/domain/errors';
import type { WorkspaceProject } from '../../../../shared/domain/schemaTypes';
import type { GithubUserSummary } from '../../../domain/entities/types';
import {
  resolveUserId,
  sanitizeId,
} from '../../../domain/policies/userIdentityPolicy';
import type { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';

export async function executeGetWorkspace(deps: {
  workspaceRepository: IWorkspaceRepository;
  user: GithubUserSummary;
  rawWorkspaceId: string;
}): Promise<WorkspaceProject> {
  const workspaceId = sanitizeId(deps.rawWorkspaceId);
  if (!workspaceId) {
    throw new ValidationError('Invalid workspace ID.');
  }

  const userId = resolveUserId(deps.user);
  const workspace = await deps.workspaceRepository.findByIdForOwner(
    workspaceId,
    userId
  );

  if (!workspace) {
    throw new NotFoundError('Workspace not found.');
  }

  return workspace;
}
