import { ValidationError } from '../../../../shared/domain/errors';
import type {
  GithubCommitEntry,
  IGithubGateway,
} from '../../../domain/gateways/IGithubGateway';

export async function executeGetGithubCommitHistory(deps: {
  githubGateway: IGithubGateway;
  accessToken?: string;
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
  perPage?: number;
}): Promise<{ commits: GithubCommitEntry[] }> {
  const owner = deps.owner.trim();
  const repo = deps.repo.trim();
  const branch = (deps.branch || '').trim();
  const filePath = (deps.path || '').trim().replace(/^\/+/, '');
  const rawPerPage = deps.perPage ?? 25;
  const perPage = Number.isFinite(rawPerPage)
    ? Math.min(Math.max(Math.trunc(rawPerPage), 1), 50)
    : 25;

  if (!owner || !repo) {
    throw new ValidationError('Missing owner or repo parameter.');
  }

  const commits = await deps.githubGateway.listCommits({
    owner,
    repo,
    branch: branch || undefined,
    path: filePath || undefined,
    perPage,
    accessToken: deps.accessToken,
  });

  return { commits };
}
