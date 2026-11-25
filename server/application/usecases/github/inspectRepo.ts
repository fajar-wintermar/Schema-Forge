import { ValidationError } from '../../../../shared/domain/errors';
import type { IGithubGateway } from '../../../domain/gateways/IGithubGateway';

export interface GithubRepoInfoData {
  full_name: string;
  owner: string;
  repo: string;
  default_branch: string;
  private: boolean;
  html_url: string;
  canPush: boolean;
  branches: string[];
  isEmpty: boolean;
}

export interface GithubTreeData {
  files: Array<{
    path: string;
    size: number;
    sha: string;
    isDbml: boolean;
  }>;
  truncated: boolean;
  isEmpty: boolean;
}

export async function executeGetGithubRepoInfo(deps: {
  githubGateway: IGithubGateway;
  accessToken?: string;
  owner: string;
  repo: string;
}): Promise<GithubRepoInfoData> {
  const owner = deps.owner.trim();
  const repo = deps.repo.trim();
  if (!owner || !repo) {
    throw new ValidationError('Missing owner or repo parameter.');
  }

  const [repoMeta, branchList] = await Promise.all([
    deps.githubGateway.getRepository(owner, repo, deps.accessToken),
    deps.githubGateway
      .listBranches(owner, repo, deps.accessToken)
      .catch(() => []),
  ]);

  const branches = branchList.map((b) => b.name);

  return {
    full_name: repoMeta.fullName,
    owner,
    repo,
    default_branch: repoMeta.defaultBranch,
    private: repoMeta.isPrivate,
    html_url: repoMeta.htmlUrl,
    canPush: repoMeta.canPush,
    branches,
    isEmpty: branches.length === 0,
  };
}

export async function executeGetGithubRepoTree(deps: {
  githubGateway: IGithubGateway;
  accessToken?: string;
  owner: string;
  repo: string;
  branch: string;
}): Promise<GithubTreeData> {
  const owner = deps.owner.trim();
  const repo = deps.repo.trim();
  const branch = (deps.branch || 'main').trim();

  if (!owner || !repo || !branch) {
    throw new ValidationError('Missing owner, repo, or branch.');
  }

  const tree = await deps.githubGateway.getRecursiveTree(
    owner,
    repo,
    branch,
    deps.accessToken,
    { treatEmptyAsEmptyResult: true }
  );

  if (tree.isEmpty) {
    return {
      files: [],
      truncated: false,
      isEmpty: true,
    };
  }

  const files = tree.entries
    .map((entry) => ({
      path: entry.path,
      size: entry.size,
      sha: entry.sha,
      isDbml: entry.path.toLowerCase().endsWith('.dbml'),
    }))
    .sort((a, b) => {
      if (a.isDbml !== b.isDbml) return a.isDbml ? -1 : 1;
      return a.path.localeCompare(b.path);
    });

  return {
    files,
    truncated: tree.truncated,
    isEmpty: false,
  };
}
