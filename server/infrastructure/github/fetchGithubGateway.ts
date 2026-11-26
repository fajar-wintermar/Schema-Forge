import {
  ConflictError,
  ExternalGatewayError,
  ValidationError,
} from '../../../shared/domain/errors';
import type {
  GithubBranchSummary,
  GithubCommitEntry,
  GithubCommitTreeResult,
  GithubFileResult,
  GithubGistFileResult,
  GithubInlineCommitFileInput,
  GithubPullRequestResult,
  GithubRepoMetadata,
  GithubTreeEntry,
  GithubTreeResult,
  IGithubGateway,
} from '../../domain/gateways/IGithubGateway';
import {
  isRecord,
  readBoolean,
  readNumber,
  readString,
} from '../../domain/policies/typeGuards';
import { encodeGithubPath } from '../../domain/policies/urlSafetyPolicy';
import {
  decodeBase64Utf8,
  encodeBase64Utf8,
} from '../security/webCryptoTokenCipher';

async function readJsonUnknown(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function githubApiFetch(
  endpoint: string,
  accessToken?: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('User-Agent', 'SchemaForge-DBML-Studio');
  headers.set('X-GitHub-Api-Version', '2022-11-28');
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }
  return fetch(`https://api.github.com${endpoint}`, {
    ...init,
    headers,
  });
}

function collectBlobShas(treeVal: unknown, target: Map<string, string>): void {
  if (!Array.isArray(treeVal)) return;
  for (const entry of treeVal) {
    if (!isRecord(entry)) continue;
    const type = readString(entry, 'type');
    const path = readString(entry, 'path');
    const sha = readString(entry, 'sha');
    if (type === 'blob' && path && sha) {
      target.set(path, sha);
    }
  }
}

export class FetchGithubGateway implements IGithubGateway {
  async getRepository(
    owner: string,
    repo: string,
    accessToken?: string
  ): Promise<GithubRepoMetadata> {
    const repoRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      accessToken
    );
    const repoJson = await readJsonUnknown(repoRes);
    const repoRecord = isRecord(repoJson) ? repoJson : {};

    if (!repoRes.ok) {
      throw new ExternalGatewayError(
        readString(repoRecord, 'message') ||
          'Repository not found or inaccessible.',
        { upstreamStatus: repoRes.status || 400 }
      );
    }

    const permissions = isRecord(repoRecord.permissions)
      ? repoRecord.permissions
      : null;
    const canPushVal = permissions ? readBoolean(permissions, 'push') : undefined;

    return {
      fullName: readString(repoRecord, 'full_name') || `${owner}/${repo}`,
      defaultBranch: readString(repoRecord, 'default_branch') || 'main',
      isPrivate: Boolean(readBoolean(repoRecord, 'private')),
      htmlUrl:
        readString(repoRecord, 'html_url') ||
        `https://github.com/${owner}/${repo}`,
      canPush: Boolean(accessToken && (canPushVal ?? true)),
    };
  }

  async listBranches(
    owner: string,
    repo: string,
    accessToken?: string
  ): Promise<GithubBranchSummary[]> {
    const branchesRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/branches?per_page=100`,
      accessToken
    );
    const branchesJson = await readJsonUnknown(branchesRes);
    if (!branchesRes.ok) {
      const errMsg = isRecord(branchesJson)
        ? readString(branchesJson, 'message')
        : undefined;
      throw new ExternalGatewayError(
        errMsg || 'Repository not found or inaccessible.',
        { upstreamStatus: branchesRes.status || 400 }
      );
    }

    const branches: GithubBranchSummary[] = [];
    if (Array.isArray(branchesJson)) {
      for (const b of branchesJson) {
        if (!isRecord(b)) continue;
        const name = readString(b, 'name');
        if (!name) continue;
        const commitObj = isRecord(b.commit) ? b.commit : null;
        branches.push({
          name,
          headCommitSha: commitObj ? readString(commitObj, 'sha') : undefined,
        });
      }
    }
    return branches;
  }

  async isRepositoryEmpty(
    owner: string,
    repo: string,
    accessToken?: string
  ): Promise<boolean> {
    try {
      const res = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/branches?per_page=1`,
        accessToken
      );
      if (!res.ok) return false;
      const branches = await readJsonUnknown(res);
      return Array.isArray(branches) && branches.length === 0;
    } catch {
      return false;
    }
  }

  async getRecursiveTree(
    owner: string,
    repo: string,
    ref: string,
    accessToken?: string,
    options?: { treatEmptyAsEmptyResult?: boolean }
  ): Promise<GithubTreeResult> {
    const treeRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      accessToken
    );

    const treeJson = await readJsonUnknown(treeRes);
    const treeRecord = isRecord(treeJson) ? treeJson : {};
    const treeMsg = readString(treeRecord, 'message') || '';

    if (!treeRes.ok) {
      if (
        options?.treatEmptyAsEmptyResult &&
        (treeRes.status === 409 || /empty/i.test(treeMsg))
      ) {
        return {
          entries: [],
          truncated: false,
          isEmpty: true,
        };
      }
      throw new ExternalGatewayError(
        treeMsg || 'Failed to read repository tree.',
        { upstreamStatus: treeRes.status || 400 }
      );
    }

    const rawTree = Array.isArray(treeRecord.tree) ? treeRecord.tree : [];
    const entries: GithubTreeEntry[] = [];
    for (const item of rawTree) {
      if (!isRecord(item)) continue;
      if (readString(item, 'type') !== 'blob') continue;
      const itemPath = readString(item, 'path');
      const itemSha = readString(item, 'sha');
      if (!itemPath || !itemSha) continue;
      entries.push({
        path: itemPath,
        size: readNumber(item, 'size') || 0,
        sha: itemSha,
      });
    }

    return {
      entries,
      truncated: Boolean(readBoolean(treeRecord, 'truncated')),
      isEmpty: false,
    };
  }

  async getFileContents(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    accessToken?: string
  ): Promise<GithubFileResult> {
    const refQuery = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const fileRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/contents/${encodeGithubPath(path)}${refQuery}`,
      accessToken
    );

    const fileJson = await readJsonUnknown(fileRes);
    const fileRecord = isRecord(fileJson) ? fileJson : {};

    if (!fileRes.ok) {
      throw new ExternalGatewayError(
        readString(fileRecord, 'message') || 'Failed to read file from GitHub.',
        { upstreamStatus: fileRes.status || 400 }
      );
    }

    const fileType = readString(fileRecord, 'type');
    const encodedContent = readString(fileRecord, 'content');
    if (fileType !== 'file' || encodedContent === undefined) {
      throw new ValidationError('Target path is not a readable text file.');
    }

    return {
      content: decodeBase64Utf8(encodedContent),
      sha: readString(fileRecord, 'sha') || '',
      path: readString(fileRecord, 'path') || path,
      htmlUrl: readString(fileRecord, 'html_url'),
    };
  }

  async tryGetOptionalFileSha(
    owner: string,
    repo: string,
    path: string,
    ref: string,
    accessToken?: string
  ): Promise<string | undefined> {
    const latestRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/contents/${encodeGithubPath(path)}?ref=${encodeURIComponent(ref)}`,
      accessToken
    );
    if (latestRes.ok) {
      const latestJson = await readJsonUnknown(latestRes);
      if (isRecord(latestJson)) {
        return readString(latestJson, 'sha');
      }
    }
    return undefined;
  }

  async getGistFile(gistId: string): Promise<GithubGistFileResult | null> {
    const gistApiRes = await githubApiFetch(
      `/gists/${encodeURIComponent(gistId)}`
    );
    if (!gistApiRes.ok) return null;

    const gistJson = await readJsonUnknown(gistApiRes);
    if (!isRecord(gistJson) || !isRecord(gistJson.files)) return null;

    const files = Object.values(gistJson.files).filter(isRecord);
    const dbmlFile =
      files.find((f) => {
        const name = readString(f, 'filename') || '';
        return name.toLowerCase().endsWith('.dbml');
      }) || files[0];

    const content = dbmlFile ? readString(dbmlFile, 'content') : undefined;
    const filename = dbmlFile ? readString(dbmlFile, 'filename') : undefined;
    if (!content || !filename) return null;

    return {
      filename,
      content,
      rawUrl: readString(dbmlFile, 'raw_url'),
    };
  }

  private async fetchBlobText(params: {
    owner: string;
    repo: string;
    sha: string;
    path: string;
    accessToken?: string;
  }): Promise<{ path: string; content: string; sha: string }> {
    const { owner, repo, sha, path, accessToken } = params;
    const blobRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/blobs/${encodeURIComponent(sha)}`,
      accessToken
    );
    const blobJson = await readJsonUnknown(blobRes);
    const blobRecord = isRecord(blobJson) ? blobJson : {};
    const rawContent = readString(blobRecord, 'content');
    if (!blobRes.ok || rawContent === undefined) {
      throw new ExternalGatewayError(
        readString(blobRecord, 'message') || `Failed to read blob for ${path}`
      );
    }
    const content =
      readString(blobRecord, 'encoding') === 'base64'
        ? decodeBase64Utf8(rawContent)
        : rawContent;
    return { path, content, sha };
  }

  async batchReadBlobs(params: {
    owner: string;
    repo: string;
    items: Array<{ path: string; sha: string }>;
    accessToken?: string;
  }): Promise<Array<{ path: string; content: string; sha: string }>> {
    const { owner, repo, items, accessToken } = params;
    const loadedFiles: Array<{ path: string; content: string; sha: string }> =
      [];

    if (accessToken) {
      const gqlChunkSize = 40;
      for (let i = 0; i < items.length; i += gqlChunkSize) {
        const slice = items
          .slice(i, i + gqlChunkSize)
          .filter((item) => /^[a-fA-F0-9]{40}$/.test(item.sha));
        if (slice.length === 0) continue;

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
            Authorization: `Bearer ${accessToken}`,
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
          throw new ExternalGatewayError(
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
              await this.fetchBlobText({
                owner,
                repo,
                sha: item.sha,
                path: item.path,
                accessToken,
              })
            );
          }
        }
      }
      return loadedFiles;
    }

    const batchSize = 8;
    for (let i = 0; i < items.length; i += batchSize) {
      const slice = items.slice(i, i + batchSize);
      const results = await Promise.all(
        slice.map((item) =>
          this.fetchBlobText({
            owner,
            repo,
            sha: item.sha,
            path: item.path,
          })
        )
      );
      loadedFiles.push(...results);
    }

    return loadedFiles;
  }

  async listCommits(params: {
    owner: string;
    repo: string;
    branch?: string;
    path?: string;
    perPage: number;
    accessToken?: string;
  }): Promise<GithubCommitEntry[]> {
    const qs = new URLSearchParams({ per_page: String(params.perPage) });
    if (params.branch) qs.set('sha', params.branch);
    if (params.path) qs.set('path', params.path);

    const res = await githubApiFetch(
      `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
        params.repo
      )}/commits?${qs.toString()}`,
      params.accessToken
    );

    const json = await readJsonUnknown(res);
    if (!res.ok || !Array.isArray(json)) {
      const errMsg = isRecord(json) ? readString(json, 'message') : undefined;
      throw new ExternalGatewayError(
        errMsg || 'Failed to fetch GitHub commit history.',
        { upstreamStatus: res.status || 400 }
      );
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
      const authorLogin = authorObj
        ? readString(authorObj, 'login') || null
        : null;
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
        date:
          (commitAuthor ? readString(commitAuthor, 'date') : undefined) || '',
        htmlUrl: readString(item, 'html_url') || '',
      });
    }

    return commits;
  }

  async createInitialReadme(params: {
    owner: string;
    repo: string;
    branch: string;
    message: string;
    content: string;
    accessToken: string;
  }): Promise<{ commitSha: string; commitUrl: string }> {
    const { owner, repo, branch, message, content, accessToken } = params;
    const putRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/contents/README.md`,
      accessToken,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          content: encodeBase64Utf8(content),
          branch,
        }),
      }
    );

    const putJson = await readJsonUnknown(putRes);
    const putRecord = isRecord(putJson) ? putJson : {};
    const commitObj = isRecord(putRecord.commit) ? putRecord.commit : null;
    const commitSha = commitObj ? readString(commitObj, 'sha') : undefined;

    if (!putRes.ok || !commitSha) {
      throw new ExternalGatewayError(
        readString(putRecord, 'message') ||
          `Failed to create "${branch}" branch on empty repository.`,
        { upstreamStatus: putRes.status || 400 }
      );
    }

    return {
      commitSha,
      commitUrl:
        (commitObj ? readString(commitObj, 'html_url') : undefined) ||
        `https://github.com/${owner}/${repo}/commit/${commitSha}`,
    };
  }

  async createBranchRef(params: {
    owner: string;
    repo: string;
    newBranch: string;
    baseSha: string;
    accessToken: string;
  }): Promise<void> {
    const { owner, repo, newBranch, baseSha, accessToken } = params;
    const createRefRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref: `refs/heads/${newBranch}`,
          sha: baseSha,
        }),
      }
    );
    const createRefJson = await readJsonUnknown(createRefRes);
    const createRefRecord = isRecord(createRefJson) ? createRefJson : {};
    if (!createRefRes.ok) {
      throw new ExternalGatewayError(
        readString(createRefRecord, 'message') ||
          `Failed to create branch "${newBranch}".`,
        { upstreamStatus: createRefRes.status || 400 }
      );
    }
  }

  async getBranchHeadCommitSha(
    owner: string,
    repo: string,
    branch: string,
    accessToken: string
  ): Promise<
    { ok: true; sha: string } | { ok: false; status: number; message: string }
  > {
    const refRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/ref/heads/${encodeURIComponent(branch)}`,
      accessToken
    );
    const refJson = await readJsonUnknown(refRes);
    const refRecord = isRecord(refJson) ? refJson : {};
    const refObject = isRecord(refRecord.object) ? refRecord.object : null;
    const refSha = refObject ? readString(refObject, 'sha') : undefined;

    if (!refRes.ok || !refSha) {
      return {
        ok: false,
        status: refRes.status || 400,
        message: readString(refRecord, 'message') || '',
      };
    }

    return { ok: true, sha: refSha };
  }

  async getCommitTreeSha(
    owner: string,
    repo: string,
    commitSha: string,
    accessToken: string
  ): Promise<string> {
    const commitRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/commits/${encodeURIComponent(commitSha)}`,
      accessToken
    );
    const commitJson = await readJsonUnknown(commitRes);
    const commitRecord = isRecord(commitJson) ? commitJson : {};
    const commitTree = isRecord(commitRecord.tree) ? commitRecord.tree : null;
    const baseTreeSha = commitTree ? readString(commitTree, 'sha') : undefined;

    if (!commitRes.ok || !baseTreeSha) {
      throw new ExternalGatewayError(
        readString(commitRecord, 'message') ||
          'Failed to read branch commit tree.',
        { upstreamStatus: commitRes.status || 400 }
      );
    }

    return baseTreeSha;
  }

  async getTreeBlobShas(
    owner: string,
    repo: string,
    treeSha: string,
    accessToken: string
  ): Promise<Map<string, string> | null> {
    const treeCheckRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
      accessToken
    );
    if (!treeCheckRes.ok) return null;
    const treeCheckJson = await readJsonUnknown(treeCheckRes);
    const treeCheckRecord = isRecord(treeCheckJson) ? treeCheckJson : {};
    const remoteShas = new Map<string, string>();
    collectBlobShas(treeCheckRecord.tree, remoteShas);
    return remoteShas;
  }

  async putSingleFile(params: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
    message: string;
    content: string;
    sha?: string;
    accessToken: string;
  }): Promise<{
    sha: string;
    path: string;
    htmlUrl: string;
    commitSha: string;
    commitUrl: string;
  }> {
    const putBody: Record<string, string> = {
      message: params.message,
      content: encodeBase64Utf8(params.content),
      branch: params.branch,
    };
    if (params.sha) {
      putBody.sha = params.sha;
    }

    const putRes = await githubApiFetch(
      `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
        params.repo
      )}/contents/${encodeGithubPath(params.path)}`,
      params.accessToken,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody),
      }
    );

    const putJson = await readJsonUnknown(putRes);
    const putRecord = isRecord(putJson) ? putJson : {};

    if (putRes.status === 409) {
      throw new ConflictError(
        'This file has been modified on GitHub since you loaded it. Pull the latest changes or push to overwrite.',
        { code: 'SHA_CONFLICT' }
      );
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
      throw new ExternalGatewayError(
        readString(putRecord, 'message') || 'Failed to push commit to GitHub.',
        { upstreamStatus: putRes.status || 400 }
      );
    }

    return {
      sha: outSha,
      path: outPath,
      htmlUrl: outHtmlUrl,
      commitSha,
      commitUrl,
    };
  }

  async putInitialBatchFirstFile(params: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
    message: string;
    content: string;
    accessToken: string;
  }): Promise<{
    path: string;
    sha: string;
    htmlUrl: string;
    commitSha: string;
    commitUrl: string;
  }> {
    const initPutRes = await githubApiFetch(
      `/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(
        params.repo
      )}/contents/${encodeGithubPath(params.path)}`,
      params.accessToken,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: params.message,
          content: encodeBase64Utf8(params.content),
          branch: params.branch,
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
      throw new ExternalGatewayError(
        readString(initPutRecord, 'message') ||
          'Failed to initialize empty repository on GitHub.',
        { upstreamStatus: initPutRes.status || 400 }
      );
    }

    return {
      path: firstPath,
      sha: firstSha,
      htmlUrl:
        (initContent ? readString(initContent, 'html_url') : undefined) ||
        `https://github.com/${params.owner}/${params.repo}/blob/${encodeURIComponent(
          params.branch
        )}/${firstPath}`,
      commitSha: firstCommitSha,
      commitUrl:
        (initCommit ? readString(initCommit, 'html_url') : undefined) ||
        `https://github.com/${params.owner}/${params.repo}/commit/${firstCommitSha}`,
    };
  }

  async commitInlineTree(params: {
    owner: string;
    repo: string;
    targetBranch: string;
    baseTreeSha: string;
    parentCommitSha: string;
    message: string;
    files: GithubInlineCommitFileInput[];
    accessToken: string;
    refAdvanceErrorMessage: string;
    conflictOn422?: boolean;
  }): Promise<GithubCommitTreeResult> {
    const {
      owner,
      repo,
      targetBranch,
      baseTreeSha,
      parentCommitSha,
      message,
      files,
      accessToken,
      refAdvanceErrorMessage,
      conflictOn422,
    } = params;

    const newTreeRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/trees`,
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: files.map((f) => ({
            path: f.cleanPath,
            mode: '100644',
            type: 'blob',
            content: f.content,
          })),
        }),
      }
    );
    const newTreeJson = await readJsonUnknown(newTreeRes);
    const newTreeRecord = isRecord(newTreeJson) ? newTreeJson : {};
    const newTreeSha = readString(newTreeRecord, 'sha');
    if (!newTreeRes.ok || !newTreeSha) {
      throw new ExternalGatewayError(
        readString(newTreeRecord, 'message') ||
          'Failed to construct commit tree.',
        { upstreamStatus: newTreeRes.status || 400 }
      );
    }

    const newCommitRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/commits`,
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          tree: newTreeSha,
          parents: [parentCommitSha],
        }),
      }
    );
    const newCommitJson = await readJsonUnknown(newCommitRes);
    const newCommitRecord = isRecord(newCommitJson) ? newCommitJson : {};
    const newCommitSha = readString(newCommitRecord, 'sha');
    if (!newCommitRes.ok || !newCommitSha) {
      throw new ExternalGatewayError(
        readString(newCommitRecord, 'message') ||
          'Failed to create Git commit.',
        { upstreamStatus: newCommitRes.status || 400 }
      );
    }

    const updateRefRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/refs/heads/${encodeURIComponent(targetBranch)}`,
      accessToken,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sha: newCommitSha,
          force: false,
        }),
      }
    );
    const updateRefJson = await readJsonUnknown(updateRefRes);
    const updateRefRecord = isRecord(updateRefJson) ? updateRefJson : {};
    if (!updateRefRes.ok) {
      if (conflictOn422 && updateRefRes.status === 422) {
        throw new ConflictError(
          readString(updateRefRecord, 'message') || refAdvanceErrorMessage
        );
      }
      throw new ExternalGatewayError(
        readString(updateRefRecord, 'message') || refAdvanceErrorMessage,
        { upstreamStatus: updateRefRes.status || 400 }
      );
    }

    const resolvedShas = new Map<string, string>();
    collectBlobShas(newTreeRecord.tree, resolvedShas);
    if (
      readBoolean(newTreeRecord, 'truncated') ||
      files.some((f) => !resolvedShas.has(f.cleanPath))
    ) {
      const fullTreeRes = await githubApiFetch(
        `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
          repo
        )}/git/trees/${encodeURIComponent(newTreeSha)}?recursive=1`,
        accessToken
      );
      if (fullTreeRes.ok) {
        const fullTreeJson = await readJsonUnknown(fullTreeRes);
        if (isRecord(fullTreeJson)) {
          collectBlobShas(fullTreeJson.tree, resolvedShas);
        }
      }
    }

    return {
      commitSha: newCommitSha,
      commitUrl:
        readString(newCommitRecord, 'html_url') ||
        `https://github.com/${owner}/${repo}/commit/${newCommitSha}`,
      files: files.map((f) => ({
        path: f.cleanPath,
        sha: resolvedShas.get(f.cleanPath) || '',
        htmlUrl: `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(
          targetBranch
        )}/${f.cleanPath}`,
      })),
    };
  }

  async createPullRequest(params: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
    accessToken: string;
  }): Promise<GithubPullRequestResult> {
    const { owner, repo, title, body, head, base, accessToken } = params;
    const prRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
      accessToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          body,
          head,
          base,
        }),
      }
    );

    const prJson = await readJsonUnknown(prRes);
    const prRecord = isRecord(prJson) ? prJson : {};

    if (!prRes.ok) {
      let detail = readString(prRecord, 'message') || 'Failed to create Pull Request.';
      if (Array.isArray(prRecord.errors) && prRecord.errors.length > 0) {
        const firstErr = prRecord.errors[0];
        if (isRecord(firstErr)) {
          const subMsg = readString(firstErr, 'message');
          if (subMsg) detail = subMsg;
        }
      }
      if (prRes.status === 422) {
        throw new ConflictError(detail, { code: 'PR_CREATE_CONFLICT' });
      }
      throw new ExternalGatewayError(detail, {
        upstreamStatus: prRes.status || 400,
      });
    }

    const prNumber = readNumber(prRecord, 'number') || 0;
    const prUrl =
      readString(prRecord, 'html_url') ||
      `https://github.com/${owner}/${repo}/pull/${prNumber}`;

    return {
      number: prNumber,
      url: prUrl,
      title: readString(prRecord, 'title') || title,
      state: readString(prRecord, 'state') || 'open',
      headBranch: head,
      baseBranch: base,
    };
  }
}
