import {
  ConflictError,
  ExternalGatewayError,
  UnauthorizedError,
  ValidationError,
} from '../../../../shared/domain/errors';
import type { IGithubGateway } from '../../../domain/gateways/IGithubGateway';
import { isValidGithubBranchName } from '../../../domain/policies/urlSafetyPolicy';

export interface GithubPushFileData {
  sha: string;
  path: string;
  branch: string;
  htmlUrl: string;
  commitSha: string;
  commitUrl: string;
}

export interface GithubPushBatchData {
  branch: string;
  commitSha: string;
  commitUrl: string;
  files: Array<{
    path: string;
    sha: string;
    htmlUrl: string;
  }>;
}

export async function executePushSingleGithubFile(deps: {
  githubGateway: IGithubGateway;
  accessToken?: string;
  body: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
    message: string;
    content: string;
    expectedSha?: string;
    createNewBranch?: boolean;
    newBranchName?: string;
    forceWithLatestSha?: boolean;
  };
}): Promise<GithubPushFileData> {
  const { githubGateway, accessToken, body } = deps;
  if (!accessToken) {
    throw new UnauthorizedError(
      'Please connect your GitHub account before pushing changes.'
    );
  }

  const {
    owner,
    repo,
    path: filePath,
    branch,
    message,
    content,
    expectedSha,
    createNewBranch,
    newBranchName,
    forceWithLatestSha,
  } = body;

  if (!owner || !repo || !filePath || !branch || !message.trim()) {
    throw new ValidationError(
      'Missing required fields: owner, repo, path, branch, message, content.'
    );
  }

  let targetBranch = branch.trim();

  if (createNewBranch) {
    const cleanBranch = (newBranchName || '').trim();
    if (!isValidGithubBranchName(cleanBranch)) {
      throw new ValidationError(
        'Please enter a valid new branch name (no spaces or special characters).'
      );
    }

    const head = await githubGateway.getBranchHeadCommitSha(
      owner,
      repo,
      targetBranch,
      accessToken
    );

    if (!head.ok) {
      const emptyRepo = await githubGateway.isRepositoryEmpty(
        owner,
        repo,
        accessToken
      );
      if (emptyRepo) {
        targetBranch = cleanBranch;
      } else {
        throw new ExternalGatewayError(
          head.message || `Unable to resolve base branch "${targetBranch}".`,
          { upstreamStatus: head.status }
        );
      }
    } else {
      await githubGateway.createBranchRef({
        owner,
        repo,
        newBranch: cleanBranch,
        baseSha: head.sha,
        accessToken,
      });
      targetBranch = cleanBranch;
    }
  }

  let shaToUse = expectedSha || undefined;
  if (forceWithLatestSha) {
    shaToUse = await githubGateway.tryGetOptionalFileSha(
      owner,
      repo,
      filePath,
      targetBranch,
      accessToken
    );
  }

  const committed = await githubGateway.putSingleFile({
    owner,
    repo,
    path: filePath,
    branch: targetBranch,
    message: message.trim(),
    content,
    sha: shaToUse,
    accessToken,
  });

  return {
    sha: committed.sha,
    path: committed.path,
    branch: targetBranch,
    htmlUrl: committed.htmlUrl,
    commitSha: committed.commitSha,
    commitUrl: committed.commitUrl,
  };
}

export async function executePushBatchGithubFiles(deps: {
  githubGateway: IGithubGateway;
  accessToken?: string;
  body: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    files: Array<{ path: string; content: string; expectedSha?: string }>;
    createNewBranch?: boolean;
    newBranchName?: string;
    forceWithLatestSha?: boolean;
  };
}): Promise<GithubPushBatchData> {
  const { githubGateway, accessToken, body } = deps;
  if (!accessToken) {
    throw new UnauthorizedError(
      'Please connect your GitHub account before pushing changes.'
    );
  }

  const {
    owner,
    repo,
    branch,
    message,
    files,
    createNewBranch,
    newBranchName,
    forceWithLatestSha,
  } = body;

  if (!owner || !repo || !branch || !message.trim() || files.length === 0) {
    throw new ValidationError(
      'Missing required fields: owner, repo, branch, message, and at least one file.'
    );
  }

  let targetBranch = branch.trim();
  const cleanFiles = files.map((f) => ({
    ...f,
    cleanPath: f.path.trim().replace(/^\/+/, ''),
  }));

  const repoEmpty = await githubGateway.isRepositoryEmpty(
    owner,
    repo,
    accessToken
  );

  if (repoEmpty) {
    if (createNewBranch) {
      const cleanBranch = (newBranchName || '').trim();
      if (!isValidGithubBranchName(cleanBranch)) {
        throw new ValidationError(
          'Please enter a valid new branch name (no spaces or special characters).'
        );
      }
      targetBranch = cleanBranch;
    }

    const first = cleanFiles[0];
    const initMsg =
      cleanFiles.length === 1
        ? message.trim()
        : `${message.trim()} (initialize repository)`;

    const firstResult = await githubGateway.putInitialBatchFirstFile({
      owner,
      repo,
      path: first.cleanPath,
      branch: targetBranch,
      message: initMsg,
      content: first.content,
      accessToken,
    });

    const firstFileSummary = {
      path: firstResult.path,
      sha: firstResult.sha,
      htmlUrl: firstResult.htmlUrl,
    };

    if (cleanFiles.length === 1) {
      return {
        branch: targetBranch,
        commitSha: firstResult.commitSha,
        commitUrl: firstResult.commitUrl,
        files: [firstFileSummary],
      };
    }

    const initTreeSha = await githubGateway.getCommitTreeSha(
      owner,
      repo,
      firstResult.commitSha,
      accessToken
    );

    const committed = await githubGateway.commitInlineTree({
      owner,
      repo,
      targetBranch,
      baseTreeSha: initTreeSha,
      parentCommitSha: firstResult.commitSha,
      message: message.trim(),
      files: cleanFiles.slice(1),
      accessToken,
      refAdvanceErrorMessage:
        'Failed to advance branch reference after initialization.',
    });

    return {
      branch: targetBranch,
      commitSha: committed.commitSha,
      commitUrl: committed.commitUrl,
      files: [firstFileSummary, ...committed.files],
    };
  }

  if (createNewBranch) {
    const cleanBranch = (newBranchName || '').trim();
    if (!isValidGithubBranchName(cleanBranch)) {
      throw new ValidationError(
        'Please enter a valid new branch name (no spaces or special characters).'
      );
    }

    const baseHead = await githubGateway.getBranchHeadCommitSha(
      owner,
      repo,
      targetBranch,
      accessToken
    );
    if (!baseHead.ok) {
      throw new ExternalGatewayError(
        baseHead.message || `Unable to resolve base branch "${targetBranch}".`,
        { upstreamStatus: baseHead.status }
      );
    }

    await githubGateway.createBranchRef({
      owner,
      repo,
      newBranch: cleanBranch,
      baseSha: baseHead.sha,
      accessToken,
    });
    targetBranch = cleanBranch;
  }

  const headRef = await githubGateway.getBranchHeadCommitSha(
    owner,
    repo,
    targetBranch,
    accessToken
  );
  if (!headRef.ok) {
    throw new ExternalGatewayError(
      headRef.message ||
        `Could not find branch "${targetBranch}" in ${owner}/${repo}.`,
      { upstreamStatus: headRef.status }
    );
  }

  const baseTreeSha = await githubGateway.getCommitTreeSha(
    owner,
    repo,
    headRef.sha,
    accessToken
  );

  if (!forceWithLatestSha && files.some((f) => Boolean(f.expectedSha))) {
    const remoteShas = await githubGateway.getTreeBlobShas(
      owner,
      repo,
      baseTreeSha,
      accessToken
    );
    if (remoteShas) {
      const conflicts = files
        .filter((f) => {
          if (!f.expectedSha) return false;
          const currentRemoteSha = remoteShas.get(f.path.replace(/^\/+/, ''));
          return Boolean(
            currentRemoteSha && currentRemoteSha !== f.expectedSha
          );
        })
        .map((f) => f.path);

      if (conflicts.length > 0) {
        throw new ConflictError(
          `Remote changes detected in: ${conflicts.join(
            ', '
          )}. Pull latest files or overwrite with your changes.`,
          { code: 'SHA_CONFLICT', conflictPaths: conflicts }
        );
      }
    }
  }

  const committed = await githubGateway.commitInlineTree({
    owner,
    repo,
    targetBranch,
    baseTreeSha,
    parentCommitSha: headRef.sha,
    message: message.trim(),
    files: cleanFiles,
    accessToken,
    refAdvanceErrorMessage:
      'Failed to advance branch reference (concurrent push occurred).',
    conflictOn422: true,
  });

  return {
    branch: targetBranch,
    commitSha: committed.commitSha,
    commitUrl: committed.commitUrl,
    files: committed.files,
  };
}
