import type { ParsedGithubUrlMeta } from '../types';

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

export function parseGithubFileUrl(inputUrl: string): ParsedGithubUrlMeta | null {
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
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'SchemaForge-DBML-Studio',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
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
    const branches = (await res.json()) as unknown[];
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
  status: number;
  error: string;
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
  const newTreeJson = (await newTreeRes.json()) as {
    sha?: string;
    tree?: Array<{ path: string; type: string; sha: string }>;
    truncated?: boolean;
    message?: string;
  };
  if (!newTreeRes.ok || !newTreeJson.sha) {
    return {
      ok: false,
      status: newTreeRes.status || 400,
      error: newTreeJson.message || 'Failed to construct commit tree.',
    };
  }

  const newCommitRes = await githubApiFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/commits`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        tree: newTreeJson.sha,
        parents: [parentCommitSha],
      }),
    }
  );
  const newCommitJson = (await newCommitRes.json()) as {
    sha?: string;
    html_url?: string;
    message?: string;
  };
  if (!newCommitRes.ok || !newCommitJson.sha) {
    return {
      ok: false,
      status: newCommitRes.status || 400,
      error: newCommitJson.message || 'Failed to create Git commit.',
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
        sha: newCommitJson.sha,
        force: false,
      }),
    }
  );
  const updateRefJson = (await updateRefRes.json()) as { message?: string };
  if (!updateRefRes.ok) {
    return {
      ok: false,
      status: conflictOn422 && updateRefRes.status === 422 ? 409 : updateRefRes.status || 400,
      error: updateRefJson.message || refAdvanceErrorMessage,
    };
  }

  const resolvedShas = new Map<string, string>();
  for (const entry of newTreeJson.tree || []) {
    if (entry.type === 'blob') resolvedShas.set(entry.path, entry.sha);
  }
  if (
    newTreeJson.truncated ||
    files.some((f) => !resolvedShas.has(f.cleanPath))
  ) {
    const fullTreeRes = await githubApiFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(
        repo
      )}/git/trees/${encodeURIComponent(newTreeJson.sha)}?recursive=1`,
      accessToken
    );
    if (fullTreeRes.ok) {
      const fullTreeJson = (await fullTreeRes.json()) as {
        tree?: Array<{ path: string; type: string; sha: string }>;
      };
      for (const entry of fullTreeJson.tree || []) {
        if (entry.type === 'blob') resolvedShas.set(entry.path, entry.sha);
      }
    }
  }

  return {
    ok: true,
    commitSha: newCommitJson.sha,
    commitUrl:
      newCommitJson.html_url ||
      `https://github.com/${owner}/${repo}/commit/${newCommitJson.sha}`,
    files: files.map((f) => ({
      path: f.cleanPath,
      sha: resolvedShas.get(f.cleanPath) || '',
      htmlUrl: `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(
        targetBranch
      )}/${f.cleanPath}`,
    })),
  };
}
