import type { ParsedGithubUrlMeta } from '../types';
import {
  isRecord,
  readBoolean,
  readJsonUnknown,
  readString,
  toErrorStatus,
  type ErrorStatusCode,
} from './http';

export function isDisallowedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '[::1]' ||
    h.endsWith('.local') ||
    h.endsWith('.internal')
  ) {
    return true;
  }
  if (/^10\.\d+\.\d+\.\d+$/.test(h)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(h)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(h)) return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(h)) return true;
  return false;
}

export function encodeGithubPath(filePath: string): string {
  return filePath
    .replace(/^\/+/, '')
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

export function parseGithubFileUrl(
  inputUrl: string
): ParsedGithubUrlMeta | null {
  try {
    const u = new URL(inputUrl);
    if (u.hostname === 'github.com' || u.hostname === 'www.github.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 5 && (parts[2] === 'blob' || parts[2] === 'raw')) {
        const [owner, repo, , branch, ...rest] = parts;
        const filePath = decodeURIComponent(rest.join('/'));
        return {
          owner,
          repo,
          branch: decodeURIComponent(branch),
          path: filePath,
          rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${rest.join('/')}`,
        };
      }
    }
    if (u.hostname === 'raw.githubusercontent.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 4) {
        const [owner, repo, branch, ...rest] = parts;
        return {
          owner,
          repo,
          branch: decodeURIComponent(branch),
          path: decodeURIComponent(rest.join('/')),
          rawUrl: inputUrl,
        };
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function githubApiFetch(
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

export async function isGithubRepoEmpty(
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

export interface InlineCommitFileInput {
  cleanPath: string;
  content: string;
}

export interface CommitInlineTreeResult {
  ok: true;
  commitSha: string;
  commitUrl: string;
  files: Array<{ path: string; sha: string; htmlUrl: string }>;
}

export interface CommitInlineTreeFailure {
  ok: false;
  status: ErrorStatusCode;
  error: string;
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

/**
 * Builds an inline Git tree + commit + advances branch ref in a minimal number of
 * subrequests (critical for Cloudflare Workers limits on 95+ file schemas).
 */
export async function commitInlineTree(params: {
  owner: string;
  repo: string;
  targetBranch: string;
  baseTreeSha: string;
  parentCommitSha: string;
  message: string;
  files: InlineCommitFileInput[];
  accessToken: string;
  refAdvanceErrorMessage: string;
  conflictOn422?: boolean;
}): Promise<CommitInlineTreeResult | CommitInlineTreeFailure> {
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
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees`,
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
    return {
      ok: false,
      status: toErrorStatus(newTreeRes.status, 400),
      error:
        readString(newTreeRecord, 'message') ||
        'Failed to construct commit tree.',
    };
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
    return {
      ok: false,
      status: toErrorStatus(newCommitRes.status, 400),
      error:
        readString(newCommitRecord, 'message') ||
        'Failed to create Git commit.',
    };
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
    return {
      ok: false,
      status:
        conflictOn422 && updateRefRes.status === 422
          ? 409
          : toErrorStatus(updateRefRes.status, 400),
      error:
        readString(updateRefRecord, 'message') || refAdvanceErrorMessage,
    };
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
    ok: true,
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

export function isValidGithubBranchName(branch: string): boolean {
  return Boolean(branch) && !/[\s~^:?*\[]/.test(branch);
}

export async function createBranchRef(params: {
  owner: string;
  repo: string;
  newBranch: string;
  baseSha: string;
  accessToken: string;
}): Promise<{ ok: true } | { ok: false; status: ErrorStatusCode; error: string }> {
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
    return {
      ok: false,
      status: toErrorStatus(createRefRes.status, 400),
      error:
        readString(createRefRecord, 'message') ||
        `Failed to create branch "${newBranch}".`,
    };
  }
  return { ok: true };
}

export async function fetchBlobText(params: {
  owner: string;
  repo: string;
  sha: string;
  path: string;
  accessToken?: string;
  decodeBase64: (b64: string) => string;
}): Promise<{ path: string; content: string; sha: string }> {
  const { owner, repo, sha, path, accessToken, decodeBase64 } = params;
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
    throw new Error(
      readString(blobRecord, 'message') || `Failed to read blob for ${path}`
    );
  }
  const content =
    readString(blobRecord, 'encoding') === 'base64'
      ? decodeBase64(rawContent)
      : rawContent;
  return { path, content, sha };
}
