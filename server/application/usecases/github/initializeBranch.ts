import { UnauthorizedError, ValidationError } from '../../../../shared/domain/errors';
import type { IGithubGateway } from '../../../domain/gateways/IGithubGateway';
import { isValidGithubBranchName } from '../../../domain/policies/urlSafetyPolicy';

export interface GithubInitBranchData {
  branch: string;
  initialized: boolean;
  alreadyExists?: boolean;
  commitSha?: string;
  commitUrl?: string;
}

export async function executeInitGithubRepositoryBranch(deps: {
  githubGateway: IGithubGateway;
  accessToken?: string;
  owner: string;
  repo: string;
  branch: string;
}): Promise<GithubInitBranchData> {
  if (!deps.accessToken) {
    throw new UnauthorizedError(
      'Please connect your GitHub account before creating a branch.'
    );
  }

  const owner = deps.owner.trim();
  const repo = deps.repo.trim();
  const branch = (deps.branch || 'main').trim();

  if (!owner || !repo || !branch) {
    throw new ValidationError(
      'Missing required fields: owner, repo, and branch.'
    );
  }

  if (!isValidGithubBranchName(branch)) {
    throw new ValidationError(
      'Please enter a valid branch name (no spaces or special characters).'
    );
  }

  const existingBranches = await deps.githubGateway.listBranches(
    owner,
    repo,
    deps.accessToken
  );

  if (existingBranches.length === 0) {
    const readmeContent = `# ${repo}\n\nDBML database schema repository managed with SchemaForge.\n`;
    const created = await deps.githubGateway.createInitialReadme({
      owner,
      repo,
      branch,
      message: `Initialize ${branch} branch`,
      content: readmeContent,
      accessToken: deps.accessToken,
    });

    return {
      branch,
      initialized: true,
      alreadyExists: false,
      commitSha: created.commitSha,
      commitUrl: created.commitUrl,
    };
  }

  if (existingBranches.some((b) => b.name === branch)) {
    return {
      branch,
      initialized: false,
      alreadyExists: true,
    };
  }

  const baseSha = existingBranches[0]?.headCommitSha;
  if (!baseSha) {
    throw new ValidationError(
      'Unable to resolve base commit SHA for branch creation.'
    );
  }

  await deps.githubGateway.createBranchRef({
    owner,
    repo,
    newBranch: branch,
    baseSha,
    accessToken: deps.accessToken,
  });

  return {
    branch,
    initialized: true,
    alreadyExists: false,
    commitSha: baseSha,
  };
}
