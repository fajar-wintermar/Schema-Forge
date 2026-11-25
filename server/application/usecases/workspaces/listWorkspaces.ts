import type { WorkspaceProject } from '../../../../shared/domain/schemaTypes';
import type { GithubUserSummary } from '../../../domain/entities/types';
import { resolveUserId } from '../../../domain/policies/userIdentityPolicy';
import type { IUserRepository } from '../../../domain/repositories/IUserRepository';
import type { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';

export async function executeListWorkspaces(deps: {
  workspaceRepository: IWorkspaceRepository;
  userRepository: IUserRepository;
  user: GithubUserSummary;
}): Promise<WorkspaceProject[]> {
  const userId = resolveUserId(deps.user);
  await deps.userRepository.upsertCloudUser(deps.user);
  return deps.workspaceRepository.listByOwner(userId);
}
