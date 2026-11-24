import type { ParsedGithubUrlMeta } from '../types';
import {
  isRecord,
  readBoolean,
  readJsonUnknown,
  readString,
  toErrorStatus,
  type ErrorStatusCode,
} from './http';

function isDisallowedIpv4Octets(a: number, b: number): boolean {
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // multicast / reserved
  return false;
}

export function isDisallowedHostname(hostname: string): boolean {
  const raw = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!raw) return true;

  if (
    raw === 'localhost' ||
    raw.endsWith('.localhost') ||
    raw === 'metadata' ||
    raw === 'metadata.google.internal' ||
    raw.endsWith('.local') ||
    raw.endsWith('.internal')
  ) {
    return true;
  }

  // Block integer, hex, or octal encoded IPv4 bypasses (e.g. 2130706433, 0x7f000001, 0177.0.0.1)
  if (/^(0x[0-9a-f]+|\d+)$/.test(raw)) {
    return true;
  }

  const ipv4Match = raw.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map((seg) => Number(seg));
    if (octets.some((n) => n < 0 || n > 255)) return true;
    return isDisallowedIpv4Octets(octets[0], octets[1]);
  }

  // Block IPv4 octal notation (leading zero in any segment)
  if (/^(0\d+\.|\d+\.0\d+)/.test(raw)) {
    return true;
  }

  // IPv6 checks (loopback, unspecified, unique-local, link-local, IPv4-mapped)
  if (raw.includes(':')) {
    if (
      raw === '::' ||
      raw === '::1' ||
      raw === '0:0:0:0:0:0:0:1' ||
      raw === '0:0:0:0:0:0:0:0' ||
      raw.startsWith('fe80:') ||
      raw.startsWith('fc') ||
      raw.startsWith('fd')
    ) {
      return true;
    }
    const v4Mapped = raw.match(/::ffff:(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4Mapped) {
      const octets = v4Mapped.slice(1).map((seg) => Number(seg));
      return isDisallowedIpv4Octets(octets[0], octets[1]);
    }
    if (raw.startsWith('::ffff:')) {
      return true;
    }
  }

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
