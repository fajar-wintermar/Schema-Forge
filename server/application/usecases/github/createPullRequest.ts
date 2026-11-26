import { UnauthorizedError, ValidationError } from '../../../../shared/domain/errors';
import type {
  GithubPullRequestResult,
  IGithubGateway,
} from '../../../domain/gateways/IGithubGateway';
import { isValidGithubBranchName } from '../../../domain/policies/urlSafetyPolicy';

export async function executeCreateGithubPullRequest(deps: {
  githubGateway: IGithubGateway;
  accessToken?: string;
  body: {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    head: string;
    base: string;
  };
}): Promise<GithubPullRequestResult> {
  const { githubGateway, accessToken, body } = deps;
  if (!accessToken) {
    throw new UnauthorizedError(
      'Please connect your GitHub account before creating a Pull Request.'
    );
  }

  const owner = body.owner.trim();
  const repo = body.repo.trim();
  const title = body.title.trim();
  const head = body.head.trim();
  const base = body.base.trim();
  const prBody = (body.body || '').trim();

  if (!owner || !repo || !title || !head || !base) {
    throw new ValidationError(
      'Missing required fields: owner, repo, title, head branch, and base branch.'
    );
  }

  if (!isValidGithubBranchName(head) || !isValidGithubBranchName(base)) {
    throw new ValidationError('Invalid head or base branch name.');
  }

  if (head === base) {
    throw new ValidationError(
      'Head branch and base branch must be different to open a Pull Request.'
    );
  }

  return githubGateway.createPullRequest({
    owner,
    repo,
    title,
    body: prBody,
    head,
    base,
    accessToken,
  });
}
