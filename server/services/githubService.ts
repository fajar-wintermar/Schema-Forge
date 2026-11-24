import type { ApiContext } from '../types';
import {
  decodeBase64Utf8,
  encodeBase64Utf8,
  getGithubSession,
} from '../lib/crypto';
import {
  commitInlineTree,
  createBranchRef,
  encodeGithubPath,
  fetchBlobText,
  githubApiFetch,
  isGithubRepoEmpty,
  isValidGithubBranchName,
} from '../lib/githubClient';
import {
  isRecord,
  readBoolean,
  readJsonUnknown,
  readNumber,
  readString,
  toErrorStatus,
  type ServiceResult,
} from '../lib/http';

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

export interface GithubCommitEntry {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorLogin: string | null;
  date: string;
  htmlUrl: string;
}

export interface GithubInitBranchData {
  branch: string;
  initialized: boolean;
  alreadyExists?: boolean;
  commitSha?: string;
  commitUrl?: string;
}

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

export async function getGithubRepoInfo(
  c: ApiContext,
  params: { owner: string; repo: string }
): Promise<ServiceResult<GithubRepoInfoData>> {
  const owner = params.owner.trim();
  const repo = params.repo.trim();
  if (!owner || !repo) {
    return {
      ok: false,
      status: 400,
      error: 'Missing owner or repo parameter.',
    };
  }

  const session = await getGithubSession(c);
  try {
    const [repoRes, branchesRes] = await Promise.all([
      githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        session?.accessToken
      ),
      githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/branches?per_page=100`,
        session?.accessToken
      ),
    ]);

    const repoJson = await readJsonUnknown(repoRes);
    const repoRecord = isRecord(repoJson) ? repoJson : {};

    if (!repoRes.ok) {
      return {
        ok: false,
        status: toErrorStatus(repoRes.status, 400),
        error:
          readString(repoRecord, 'message') ||
          'Repository not found or inaccessible.',
      };
    }

    const branchesJson = branchesRes.ok
      ? await readJsonUnknown(branchesRes)
      : [];
    const branches: string[] = [];
    if (Array.isArray(branchesJson)) {
      for (const b of branchesJson) {
        if (isRecord(b)) {
          const name = readString(b, 'name');
          if (name) branches.push(name);
        }
      }
    }

    const permissions = isRecord(repoRecord.permissions)
      ? repoRecord.permissions
      : null;
    const canPushVal = permissions ? readBoolean(permissions, 'push') : undefined;

    return {
      ok: true,
      data: {
        full_name: readString(repoRecord, 'full_name') || `${owner}/${repo}`,
        owner,
        repo,
        default_branch: readString(repoRecord, 'default_branch') || 'main',
        private: Boolean(readBoolean(repoRecord, 'private')),
        html_url:
          readString(repoRecord, 'html_url') ||
          `https://github.com/${owner}/${repo}`,
        canPush: Boolean(session && (canPushVal ?? true)),
        branches,
        isEmpty: branches.length === 0,
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error:
        err instanceof Error ? err.message : 'Failed to inspect repository.',
    };
  }
}

export async function getGithubRepoTree(
  c: ApiContext,
  params: { owner: string; repo: string; branch: string }
): Promise<ServiceResult<GithubTreeData>> {
  const owner = params.owner.trim();
  const repo = params.repo.trim();
  const branch = (params.branch || 'main').trim();

  if (!owner || !repo || !branch) {
    return {
      ok: false,
      status: 400,
      error: 'Missing owner, repo, or branch.',
    };
  }

  const session = await getGithubSession(c);
  try {
    const treeRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      session?.accessToken
    );

    const treeJson = await readJsonUnknown(treeRes);
    const treeRecord = isRecord(treeJson) ? treeJson : {};
    const treeMsg = readString(treeRecord, 'message') || '';

    if (!treeRes.ok) {
      if (treeRes.status === 409 || /empty/i.test(treeMsg)) {
        return {
          ok: true,
          data: {
            files: [],
            truncated: false,
            isEmpty: true,
          },
        };
      }
      return {
        ok: false,
        status: toErrorStatus(treeRes.status, 400),
        error: treeMsg || 'Failed to read repository file tree.',
      };
    }

    const rawTree = Array.isArray(treeRecord.tree) ? treeRecord.tree : [];
    const files: GithubTreeData['files'] = [];
    for (const item of rawTree) {
      if (!isRecord(item)) continue;
      if (readString(item, 'type') !== 'blob') continue;
      const itemPath = readString(item, 'path');
      const itemSha = readString(item, 'sha');
      if (!itemPath || !itemSha) continue;
      files.push({
        path: itemPath,
        size: readNumber(item, 'size') || 0,
        sha: itemSha,
        isDbml: itemPath.toLowerCase().endsWith('.dbml'),
      });
    }

    files.sort((a, b) => {
      if (a.isDbml !== b.isDbml) return a.isDbml ? -1 : 1;
      return a.path.localeCompare(b.path);
    });

    return {
      ok: true,
      data: {
        files,
        truncated: Boolean(readBoolean(treeRecord, 'truncated')),
        isEmpty: false,
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : 'Failed to fetch file tree.',
    };
  }
}

export async function getGithubSingleFile(
  c: ApiContext,
  params: { owner: string; repo: string; path: string; ref?: string }
): Promise<ServiceResult<GithubFileData>> {
  const owner = params.owner.trim();
  const repo = params.repo.trim();
  const filePath = params.path.trim();
  const ref = (params.ref || '').trim();

  if (!owner || !repo || !filePath) {
    return { ok: false, status: 400, error: 'Missing owner, repo, or path.' };
  }

  const session = await getGithubSession(c);
  try {
    const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const fileRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/contents/${encodeGithubPath(filePath)}${refQuery}`,
      session?.accessToken
    );

    const fileJson = await readJsonUnknown(fileRes);
    const fileRecord = isRecord(fileJson) ? fileJson : {};

    if (!fileRes.ok) {
      return {
        ok: false,
        status: toErrorStatus(fileRes.status, 400),
        error:
          readString(fileRecord, 'message') ||
          'Failed to read file from GitHub.',
      };
    }

    const fileType = readString(fileRecord, 'type');
    const encodedContent = readString(fileRecord, 'content');
    if (fileType !== 'file' || encodedContent === undefined) {
      return {
        ok: false,
        status: 400,
        error: 'Target path is not a readable text file.',
      };
    }

    return {
      ok: true,
      data: {
        content: decodeBase64Utf8(encodedContent),
        sha: readString(fileRecord, 'sha') || '',
        path: readString(fileRecord, 'path') || filePath,
        branch: ref || 'main',
        htmlUrl: readString(fileRecord, 'html_url'),
        owner,
        repo,
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error:
        err instanceof Error ? err.message : 'Failed to fetch GitHub file.',
    };
  }
}

export async function getGithubModularFolder(
  c: ApiContext,
  params: { owner: string; repo: string; branch: string; folder: string }
): Promise<ServiceResult<GithubFolderData>> {
  const owner = params.owner.trim();
  const repo = params.repo.trim();
  const branch = (params.branch || 'main').trim();
  const folder = (params.folder || 'schema').trim().replace(/^\/+|\/+$/g, '');

  if (!owner || !repo || !branch || !folder) {
    return {
      ok: false,
      status: 400,
      error: 'Missing required parameters: owner, repo, branch, folder.',
    };
  }

  const session = await getGithubSession(c);
  try {
    const treeRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      session?.accessToken
    );

    const treeJson = await readJsonUnknown(treeRes);
    const treeRecord = isRecord(treeJson) ? treeJson : {};

    if (!treeRes.ok) {
      return {
        ok: false,
        status: toErrorStatus(treeRes.status, 400),
        error:
          readString(treeRecord, 'message') || 'Failed to read repository tree.',
      };
    }

    const prefix = `${folder}/`;
    const rawTree = Array.isArray(treeRecord.tree) ? treeRecord.tree : [];
    const dbmlItems: Array<{ path: string; sha: string }> = [];

    for (const item of rawTree) {
      if (!isRecord(item)) continue;
      if (readString(item, 'type') !== 'blob') continue;
      const itemPath = readString(item, 'path');
      const itemSha = readString(item, 'sha');
      if (
        itemPath &&
        itemSha &&
        itemPath.startsWith(prefix) &&
        itemPath.toLowerCase().endsWith('.dbml')
      ) {
        dbmlItems.push({ path: itemPath, sha: itemSha });
      }
    }

    dbmlItems.sort((a, b) => a.path.localeCompare(b.path));

    if (dbmlItems.length === 0) {
      return {
        ok: false,
        status: 404,
        error: `No .dbml files found inside "${folder}/" on branch "${branch}".`,
      };
    }

    if (dbmlItems.length > 250) {
      return {
        ok: false,
        status: 400,
        error: `Folder contains ${dbmlItems.length} .dbml files (max 250 per load).`,
      };
    }

    const loadedFiles: Array<{ path: string; content: string; sha: string }> =
      [];

    if (session?.accessToken) {
      const gqlChunkSize = 40;
      for (let i = 0; i < dbmlItems.length; i += gqlChunkSize) {
        const slice = dbmlItems.slice(i, i + gqlChunkSize);
        const aliasFields = slice
          .map(
            (item, idx) =>
              `f${idx}: object(oid: ${JSON.stringify(
                item.sha
              )}) { ... on Blob { text } }`
          )
          .join('\n');
        const gqlQuery = `query($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    ${aliasFields}
  }
}`;
        const gqlRes = await fetch('https://api.github.com/graphql', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'SchemaForge-DBML-Studio',
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({
            query: gqlQuery,
            variables: { owner, repo },
          }),
        });

        const gqlJson = await readJsonUnknown(gqlRes);
        const gqlRecord = isRecord(gqlJson) ? gqlJson : {};
        const gqlData = isRecord(gqlRecord.data) ? gqlRecord.data : null;
        const repoData =
          gqlData && isRecord(gqlData.repository) ? gqlData.repository : null;

        if (!gqlRes.ok || !repoData) {
          const firstError =
            Array.isArray(gqlRecord.errors) &&
            gqlRecord.errors[0] &&
            isRecord(gqlRecord.errors[0])
              ? readString(gqlRecord.errors[0], 'message')
              : undefined;
          throw new Error(
            firstError || 'Failed to batch-load modular files from GitHub.'
          );
        }

        for (let idx = 0; idx < slice.length; idx++) {
          const item = slice[idx];
          const blobEntry = repoData[`f${idx}`];
          const text = isRecord(blobEntry)
            ? readString(blobEntry, 'text')
            : undefined;
          if (text !== undefined) {
            loadedFiles.push({
              path: item.path,
              content: text,
              sha: item.sha,
            });
          } else {
            loadedFiles.push(
              await fetchBlobText({
                owner,
                repo,
                sha: item.sha,
                path: item.path,
                accessToken: session.accessToken,
                decodeBase64: decodeBase64Utf8,
              })
            );
          }
        }
      }
    } else {
      const batchSize = 8;
      for (let i = 0; i < dbmlItems.length; i += batchSize) {
        const slice = dbmlItems.slice(i, i + batchSize);
        const results = await Promise.all(
          slice.map((item) =>
            fetchBlobText({
              owner,
              repo,
              sha: item.sha,
              path: item.path,
              decodeBase64: decodeBase64Utf8,
            })
          )
        );
        loadedFiles.push(...results);
      }
    }

    return {
      ok: true,
      data: {
        owner,
        repo,
        branch,
        folder,
        files: loadedFiles,
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to load modular schema folder.',
    };
  }
}

export async function getGithubCommitHistory(
  c: ApiContext,
  params: {
    owner: string;
    repo: string;
    branch?: string;
    path?: string;
    perPage?: number;
  }
): Promise<ServiceResult<{ commits: GithubCommitEntry[] }>> {
  const owner = params.owner.trim();
  const repo = params.repo.trim();
  const branch = (params.branch || '').trim();
  const filePath = (params.path || '').trim().replace(/^\/+/, '');
  const rawPerPage = params.perPage ?? 25;
  const perPage = Number.isFinite(rawPerPage)
    ? Math.min(Math.max(Math.trunc(rawPerPage), 1), 50)
    : 25;

  if (!owner || !repo) {
    return {
      ok: false,
      status: 400,
      error: 'Missing owner or repo parameter.',
    };
  }

  const session = await getGithubSession(c);
  try {
    const qs = new URLSearchParams({ per_page: String(perPage) });
    if (branch) qs.set('sha', branch);
    if (filePath) qs.set('path', filePath);

    const res = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/commits?${qs.toString()}`,
      session?.accessToken
    );

    const json = await readJsonUnknown(res);
    if (!res.ok || !Array.isArray(json)) {
      const errMsg = isRecord(json) ? readString(json, 'message') : undefined;
      return {
        ok: false,
        status: toErrorStatus(res.status, 400),
        error: errMsg || 'Failed to fetch GitHub commit history.',
      };
    }

    const commits: GithubCommitEntry[] = [];
    for (const item of json) {
      if (!isRecord(item)) continue;
      const sha = readString(item, 'sha');
      if (!sha) continue;
      const commitObj = isRecord(item.commit) ? item.commit : null;
      const commitAuthor =
        commitObj && isRecord(commitObj.author) ? commitObj.author : null;
      const authorObj = isRecord(item.author) ? item.author : null;
      const authorLogin = authorObj ? readString(authorObj, 'login') || null : null;
      const rawMessage = commitObj ? readString(commitObj, 'message') || '' : '';

      commits.push({
        sha,
        shortSha: sha.slice(0, 7),
        message: rawMessage.split('\n')[0],
        authorName:
          (commitAuthor ? readString(commitAuthor, 'name') : undefined) ||
          authorLogin ||
          'Unknown',
        authorLogin,
        date: (commitAuthor ? readString(commitAuthor, 'date') : undefined) || '',
        htmlUrl: readString(item, 'html_url') || '',
      });
    }

    return { ok: true, data: { commits } };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to fetch GitHub commit history.',
    };
  }
}

export async function initGithubRepositoryBranch(
  c: ApiContext,
  params: { owner: string; repo: string; branch: string }
): Promise<ServiceResult<GithubInitBranchData>> {
  const session = await getGithubSession(c);
  if (!session) {
    return {
      ok: false,
      status: 401,
      error: 'Please connect your GitHub account before creating a branch.',
    };
  }

  const owner = params.owner.trim();
  const repo = params.repo.trim();
  const branch = (params.branch || 'main').trim();

  if (!owner || !repo || !branch) {
    return {
      ok: false,
      status: 400,
      error: 'Missing required fields: owner, repo, and branch.',
    };
  }

  if (!isValidGithubBranchName(branch)) {
    return {
      ok: false,
      status: 400,
      error:
        'Please enter a valid branch name (no spaces or special characters).',
    };
  }

  try {
    const branchesRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/branches?per_page=100`,
      session.accessToken
    );
    const branchesJson = await readJsonUnknown(branchesRes);

    if (!branchesRes.ok) {
      const errMsg = isRecord(branchesJson)
        ? readString(branchesJson, 'message')
        : undefined;
      return {
        ok: false,
        status: toErrorStatus(branchesRes.status, 400),
        error: errMsg || 'Repository not found or inaccessible.',
      };
    }

    const existingBranches = Array.isArray(branchesJson)
      ? branchesJson.filter(isRecord)
      : [];

    if (existingBranches.length === 0) {
      const readmeContent = `# ${repo}\n\nDBML database schema repository managed with SchemaForge.\n`;
      const putRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/contents/README.md`,
        session.accessToken,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Initialize ${branch} branch`,
            content: encodeBase64Utf8(readmeContent),
            branch,
          }),
        }
      );

      const putJson = await readJsonUnknown(putRes);
      const putRecord = isRecord(putJson) ? putJson : {};
      const commitObj = isRecord(putRecord.commit) ? putRecord.commit : null;
      const commitSha = commitObj ? readString(commitObj, 'sha') : undefined;

      if (!putRes.ok || !commitSha) {
        return {
          ok: false,
          status: toErrorStatus(putRes.status, 400),
          error:
            readString(putRecord, 'message') ||
            `Failed to create "${branch}" branch on empty repository.`,
        };
      }

      return {
        ok: true,
        data: {
          branch,
          initialized: true,
          alreadyExists: false,
          commitSha,
          commitUrl:
            (commitObj ? readString(commitObj, 'html_url') : undefined) ||
            `https://github.com/${owner}/${repo}/commit/${commitSha}`,
        },
      };
    }

    if (existingBranches.some((b) => readString(b, 'name') === branch)) {
      return {
        ok: true,
        data: {
          branch,
          initialized: false,
          alreadyExists: true,
        },
      };
    }

    const firstCommit = isRecord(existingBranches[0]?.commit)
      ? existingBranches[0].commit
      : null;
    const baseSha = firstCommit ? readString(firstCommit, 'sha') : undefined;
    if (!baseSha) {
      return {
        ok: false,
        status: 400,
        error: 'Unable to resolve base commit SHA for branch creation.',
      };
    }

    const created = await createBranchRef({
      owner,
      repo,
      newBranch: branch,
      baseSha,
      accessToken: session.accessToken,
    });
    if (!created.ok) {
      return { ok: false, status: created.status, error: created.error };
    }

    return {
      ok: true,
      data: {
        branch,
        initialized: true,
        alreadyExists: false,
        commitSha: baseSha,
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to initialize repository branch.',
    };
  }
}

export async function pushSingleGithubFile(
  c: ApiContext,
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
  }
): Promise<ServiceResult<GithubPushFileData>> {
  const session = await getGithubSession(c);
  if (!session) {
    return {
      ok: false,
      status: 401,
      error: 'Please connect your GitHub account before pushing changes.',
    };
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
    return {
      ok: false,
      status: 400,
      error:
        'Missing required fields: owner, repo, path, branch, message, content.',
    };
  }

  try {
    let targetBranch = branch.trim();

    if (createNewBranch) {
      const cleanBranch = (newBranchName || '').trim();
      if (!isValidGithubBranchName(cleanBranch)) {
        return {
          ok: false,
          status: 400,
          error:
            'Please enter a valid new branch name (no spaces or special characters).',
        };
      }

      const refRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
        session.accessToken
      );
      const refJson = await readJsonUnknown(refRes);
      const refRecord = isRecord(refJson) ? refJson : {};
      const refObject = isRecord(refRecord.object) ? refRecord.object : null;
      const refSha = refObject ? readString(refObject, 'sha') : undefined;

      if (!refRes.ok || !refSha) {
        const emptyRepo = await isGithubRepoEmpty(
          owner,
          repo,
          session.accessToken
        );
        if (emptyRepo) {
          targetBranch = cleanBranch;
        } else {
          return {
            ok: false,
            status: toErrorStatus(refRes.status, 400),
            error:
              readString(refRecord, 'message') ||
              `Unable to resolve base branch "${targetBranch}".`,
          };
        }
      } else {
        const created = await createBranchRef({
          owner,
          repo,
          newBranch: cleanBranch,
          baseSha: refSha,
          accessToken: session.accessToken,
        });
        if (!created.ok) {
          return { ok: false, status: created.status, error: created.error };
        }
        targetBranch = cleanBranch;
      }
    }

    let shaToUse = expectedSha || undefined;

    if (forceWithLatestSha) {
      const latestRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/contents/${encodeGithubPath(filePath)}?ref=${encodeURIComponent(
          targetBranch
        )}`,
        session.accessToken
      );
      if (latestRes.ok) {
        const latestJson = await readJsonUnknown(latestRes);
        if (isRecord(latestJson)) {
          shaToUse = readString(latestJson, 'sha');
        }
      } else if (latestRes.status === 404) {
        shaToUse = undefined;
      }
    }

    const putBody: Record<string, string> = {
      message: message.trim(),
      content: encodeBase64Utf8(content),
      branch: targetBranch,
    };
    if (shaToUse) {
      putBody.sha = shaToUse;
    }

    const putRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/contents/${encodeGithubPath(filePath)}`,
      session.accessToken,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody),
      }
    );

    const putJson = await readJsonUnknown(putRes);
    const putRecord = isRecord(putJson) ? putJson : {};

    if (putRes.status === 409) {
      return {
        ok: false,
        status: 409,
        code: 'SHA_CONFLICT',
        error:
          'This file has been modified on GitHub since you loaded it. Pull the latest changes or push to overwrite.',
      };
    }

    const contentObj = isRecord(putRecord.content) ? putRecord.content : null;
    const commitObj = isRecord(putRecord.commit) ? putRecord.commit : null;
    const outSha = contentObj ? readString(contentObj, 'sha') : undefined;
    const outPath = contentObj ? readString(contentObj, 'path') : undefined;
    const outHtmlUrl = contentObj
      ? readString(contentObj, 'html_url')
      : undefined;
    const commitSha = commitObj ? readString(commitObj, 'sha') : undefined;
    const commitUrl = commitObj
      ? readString(commitObj, 'html_url')
      : undefined;

    if (
      !putRes.ok ||
      !outSha ||
      !outPath ||
      !outHtmlUrl ||
      !commitSha ||
      !commitUrl
    ) {
      return {
        ok: false,
        status: toErrorStatus(putRes.status, 400),
        error:
          readString(putRecord, 'message') || 'Failed to push commit to GitHub.',
      };
    }

    return {
      ok: true,
      data: {
        sha: outSha,
        path: outPath,
        branch: targetBranch,
        htmlUrl: outHtmlUrl,
        commitSha,
        commitUrl,
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: err instanceof Error ? err.message : 'GitHub push failed.',
    };
  }
}

export async function pushBatchGithubFiles(
  c: ApiContext,
  body: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    files: Array<{ path: string; content: string; expectedSha?: string }>;
    createNewBranch?: boolean;
    newBranchName?: string;
    forceWithLatestSha?: boolean;
  }
): Promise<ServiceResult<GithubPushBatchData>> {
  const session = await getGithubSession(c);
  if (!session) {
    return {
      ok: false,
      status: 401,
      error: 'Please connect your GitHub account before pushing changes.',
    };
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
    return {
      ok: false,
      status: 400,
      error:
        'Missing required fields: owner, repo, branch, message, and at least one file.',
    };
  }

  try {
    let targetBranch = branch.trim();
    const cleanFiles = files.map((f) => ({
      ...f,
      cleanPath: f.path.trim().replace(/^\/+/, ''),
    }));

    const repoEmpty = await isGithubRepoEmpty(owner, repo, session.accessToken);

    if (repoEmpty) {
      if (createNewBranch) {
        const cleanBranch = (newBranchName || '').trim();
        if (!isValidGithubBranchName(cleanBranch)) {
          return {
            ok: false,
            status: 400,
            error:
              'Please enter a valid new branch name (no spaces or special characters).',
          };
        }
        targetBranch = cleanBranch;
      }

      const first = cleanFiles[0];
      const initMsg =
        cleanFiles.length === 1
          ? message.trim()
          : `${message.trim()} (initialize repository)`;
      const initPutRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/contents/${encodeGithubPath(first.cleanPath)}`,
        session.accessToken,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: initMsg,
            content: encodeBase64Utf8(first.content),
            branch: targetBranch,
          }),
        }
      );
      const initPutJson = await readJsonUnknown(initPutRes);
      const initPutRecord = isRecord(initPutJson) ? initPutJson : {};
      const initContent = isRecord(initPutRecord.content)
        ? initPutRecord.content
        : null;
      const initCommit = isRecord(initPutRecord.commit)
        ? initPutRecord.commit
        : null;
      const firstPath = initContent ? readString(initContent, 'path') : undefined;
      const firstSha = initContent ? readString(initContent, 'sha') : undefined;
      const firstCommitSha = initCommit
        ? readString(initCommit, 'sha')
        : undefined;

      if (!initPutRes.ok || !firstPath || !firstSha || !firstCommitSha) {
        return {
          ok: false,
          status: toErrorStatus(initPutRes.status, 400),
          error:
            readString(initPutRecord, 'message') ||
            'Failed to initialize empty repository on GitHub.',
        };
      }

      const firstFileResult = {
        path: firstPath,
        sha: firstSha,
        htmlUrl:
          (initContent ? readString(initContent, 'html_url') : undefined) ||
          `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(
            targetBranch
          )}/${firstPath}`,
      };

      if (cleanFiles.length === 1) {
        return {
          ok: true,
          data: {
            branch: targetBranch,
            commitSha: firstCommitSha,
            commitUrl:
              (initCommit ? readString(initCommit, 'html_url') : undefined) ||
              `https://github.com/${owner}/${repo}/commit/${firstCommitSha}`,
            files: [firstFileResult],
          },
        };
      }

      const initCommitRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/git/commits/${encodeURIComponent(firstCommitSha)}`,
        session.accessToken
      );
      const initCommitJson = await readJsonUnknown(initCommitRes);
      const initCommitRecord = isRecord(initCommitJson) ? initCommitJson : {};
      const initTree = isRecord(initCommitRecord.tree)
        ? initCommitRecord.tree
        : null;
      const initTreeSha = initTree ? readString(initTree, 'sha') : undefined;

      if (!initCommitRes.ok || !initTreeSha) {
        return {
          ok: false,
          status: toErrorStatus(initCommitRes.status, 400),
          error:
            readString(initCommitRecord, 'message') ||
            'Initialized repository but failed to read initial commit tree.',
        };
      }

      const committed = await commitInlineTree({
        owner,
        repo,
        targetBranch,
        baseTreeSha: initTreeSha,
        parentCommitSha: firstCommitSha,
        message: message.trim(),
        files: cleanFiles.slice(1),
        accessToken: session.accessToken,
        refAdvanceErrorMessage:
          'Failed to advance branch reference after initialization.',
      });

      if (!committed.ok) {
        return {
          ok: false,
          status: committed.status,
          error: committed.error,
        };
      }

      return {
        ok: true,
        data: {
          branch: targetBranch,
          commitSha: committed.commitSha,
          commitUrl: committed.commitUrl,
          files: [firstFileResult, ...committed.files],
        },
      };
    }

    if (createNewBranch) {
      const cleanBranch = (newBranchName || '').trim();
      if (!isValidGithubBranchName(cleanBranch)) {
        return {
          ok: false,
          status: 400,
          error:
            'Please enter a valid new branch name (no spaces or special characters).',
        };
      }

      const baseRefRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
        session.accessToken
      );
      const baseRefJson = await readJsonUnknown(baseRefRes);
      const baseRefRecord = isRecord(baseRefJson) ? baseRefJson : {};
      const baseRefObj = isRecord(baseRefRecord.object)
        ? baseRefRecord.object
        : null;
      const baseSha = baseRefObj ? readString(baseRefObj, 'sha') : undefined;

      if (!baseRefRes.ok || !baseSha) {
        return {
          ok: false,
          status: toErrorStatus(baseRefRes.status, 400),
          error:
            readString(baseRefRecord, 'message') ||
            `Unable to resolve base branch "${targetBranch}".`,
        };
      }

      const created = await createBranchRef({
        owner,
        repo,
        newBranch: cleanBranch,
        baseSha,
        accessToken: session.accessToken,
      });
      if (!created.ok) {
        return { ok: false, status: created.status, error: created.error };
      }
      targetBranch = cleanBranch;
    }

    const headRefRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
      session.accessToken
    );
    const headRefJson = await readJsonUnknown(headRefRes);
    const headRefRecord = isRecord(headRefJson) ? headRefJson : {};
    const headRefObj = isRecord(headRefRecord.object)
      ? headRefRecord.object
      : null;
    const parentCommitSha = headRefObj ? readString(headRefObj, 'sha') : undefined;

    if (!headRefRes.ok || !parentCommitSha) {
      return {
        ok: false,
        status: toErrorStatus(headRefRes.status, 400),
        error:
          readString(headRefRecord, 'message') ||
          `Could not find branch "${targetBranch}" in ${owner}/${repo}.`,
      };
    }

    const commitRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/commits/${encodeURIComponent(parentCommitSha)}`,
      session.accessToken
    );
    const commitJson = await readJsonUnknown(commitRes);
    const commitRecord = isRecord(commitJson) ? commitJson : {};
    const commitTree = isRecord(commitRecord.tree) ? commitRecord.tree : null;
    const baseTreeSha = commitTree ? readString(commitTree, 'sha') : undefined;

    if (!commitRes.ok || !baseTreeSha) {
      return {
        ok: false,
        status: toErrorStatus(commitRes.status, 400),
        error:
          readString(commitRecord, 'message') ||
          'Failed to read branch commit tree.',
      };
    }

    if (!forceWithLatestSha && files.some((f) => Boolean(f.expectedSha))) {
      const treeCheckRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/git/trees/${encodeURIComponent(baseTreeSha)}?recursive=1`,
        session.accessToken
      );
      if (treeCheckRes.ok) {
        const treeCheckJson = await readJsonUnknown(treeCheckRes);
        const treeCheckRecord = isRecord(treeCheckJson) ? treeCheckJson : {};
        const entries = Array.isArray(treeCheckRecord.tree)
          ? treeCheckRecord.tree
          : [];
        const remoteShas = new Map<string, string>();
        for (const entry of entries) {
          if (!isRecord(entry)) continue;
          if (readString(entry, 'type') !== 'blob') continue;
          const p = readString(entry, 'path');
          const s = readString(entry, 'sha');
          if (p && s) remoteShas.set(p, s);
        }
        const conflicts = files
          .filter((f) => {
            if (!f.expectedSha) return false;
            const currentRemoteSha = remoteShas.get(
              f.path.replace(/^\/+/, '')
            );
            return Boolean(
              currentRemoteSha && currentRemoteSha !== f.expectedSha
            );
          })
          .map((f) => f.path);
        if (conflicts.length > 0) {
          return {
            ok: false,
            status: 409,
            code: 'SHA_CONFLICT',
            conflictPaths: conflicts,
            error: `Remote changes detected in: ${conflicts.join(
              ', '
            )}. Pull latest files or overwrite with your changes.`,
          };
        }
      }
    }

    const committed = await commitInlineTree({
      owner,
      repo,
      targetBranch,
      baseTreeSha,
      parentCommitSha,
      message: message.trim(),
      files: cleanFiles,
      accessToken: session.accessToken,
      refAdvanceErrorMessage:
        'Failed to advance branch reference (concurrent push occurred).',
      conflictOn422: true,
    });

    if (!committed.ok) {
      return { ok: false, status: committed.status, error: committed.error };
    }

    return {
      ok: true,
      data: {
        branch: targetBranch,
        commitSha: committed.commitSha,
        commitUrl: committed.commitUrl,
        files: committed.files,
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error:
        err instanceof Error
          ? err.message
          : 'Failed to push modular files to GitHub.',
    };
  }
}
