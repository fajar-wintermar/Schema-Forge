import { NotFoundError, ValidationError } from '../../../../shared/domain/errors';
import type { IGithubGateway } from '../../../domain/gateways/IGithubGateway';

export interface GithubFileData {
  content: string;
  sha: string;
  path: string;
  branch: string;
  htmlUrl?: string;
  owner: string;
  repo: string;
}

export interface GithubFolderData {
  owner: string;
  repo: string;
  branch: string;
  folder: string;
  files: Array<{
    path: string;
    content: string;
    sha: string;
  }>;
}

export async function executeGetGithubSingleFile(deps: {
  githubGateway: IGithubGateway;
  accessToken?: string;
  owner: string;
  repo: string;
  path: string;
  ref?: string;
}): Promise<GithubFileData> {
  const owner = deps.owner.trim();
  const repo = deps.repo.trim();
  const filePath = deps.path.trim();
  const ref = (deps.ref || '').trim();

  if (!owner || !repo || !filePath) {
    throw new ValidationError('Missing owner, repo, or path.');
  }

  const file = await deps.githubGateway.getFileContents(
    owner,
    repo,
    filePath,
    ref || undefined,
    deps.accessToken
  );

  return {
    content: file.content,
    sha: file.sha,
    path: file.path,
    branch: ref || 'main',
    htmlUrl: file.htmlUrl,
    owner,
    repo,
  };
}

export async function executeGetGithubModularFolder(deps: {
  githubGateway: IGithubGateway;
  accessToken?: string;
  owner: string;
  repo: string;
  branch: string;
  folder: string;
}): Promise<GithubFolderData> {
  const owner = deps.owner.trim();
  const repo = deps.repo.trim();
  const branch = (deps.branch || 'main').trim();
  const folder = (deps.folder || 'schema').trim().replace(/^\/+|\/+$/g, '');

  if (!owner || !repo || !branch || !folder) {
    throw new ValidationError(
      'Missing required parameters: owner, repo, branch, folder.'
    );
  }

  const tree = await deps.githubGateway.getRecursiveTree(
    owner,
    repo,
    branch,
    deps.accessToken
  );

  const prefix = `${folder}/`;
  const dbmlItems = tree.entries
    .filter(
      (item) =>
        item.path.startsWith(prefix) &&
        item.path.toLowerCase().endsWith('.dbml')
    )
    .map((item) => ({ path: item.path, sha: item.sha }))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (dbmlItems.length === 0) {
    throw new NotFoundError(
      `No .dbml files found inside "${folder}/" on branch "${branch}".`
    );
  }

  if (dbmlItems.length > 250) {
    throw new ValidationError(
      `Folder contains ${dbmlItems.length} .dbml files (max 250 per load).`
    );
  }

  const loadedFiles = await deps.githubGateway.batchReadBlobs({
    owner,
    repo,
    items: dbmlItems,
    accessToken: deps.accessToken,
  });

  return {
    owner,
    repo,
    branch,
    folder,
    files: loadedFiles,
  };
}
