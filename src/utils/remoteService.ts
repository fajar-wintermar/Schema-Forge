export interface RemoteFetchResult {
  content: string;
  originalUrl: string;
  resolvedUrl: string;
  filename: string;
  githubMeta?: {
    owner: string;
    repo: string;
    branch: string;
    path: string;
    sha?: string;
    htmlUrl?: string;
  } | null;
}

export interface GithubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

export interface GithubAuthStatus {
  configured: boolean;
  connected: boolean;
  user: GithubUser | null;
  callbackUrl: string;
}


export interface GithubRepoInfo {
  full_name: string;
  owner: string;
  repo: string;
  default_branch: string;
  private: boolean;
  html_url: string;
  canPush: boolean;
  branches: string[];
  isEmpty?: boolean;
}

export interface GithubTreeFile {
  path: string;
  size: number;
  sha: string;
  isDbml: boolean;
}

export interface GithubFileResult {
  content: string;
  sha: string;
  path: string;
  branch: string;
  htmlUrl?: string;
  owner: string;
  repo: string;
}

export interface GithubPushPayload {
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

export interface GithubPushResult {
  sha: string;
  path: string;
  branch: string;
  htmlUrl: string;
  commitSha: string;
  commitUrl: string;
}

const SESSION_STORAGE_KEY = 'sf_gh_session_token';

export function getStoredGithubSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

export const AUTH_CHANGED_EVENT = 'schemaforge:auth-changed';

export function notifyAuthChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  }
}

export function setStoredGithubSessionToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(SESSION_STORAGE_KEY, token);
    else sessionStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage quota / private mode restrictions
  }
  notifyAuthChanged();
}

export async function apiRequest<T>(
  url: string,
  init: RequestInit = {}
): Promise<T> {
  const token = getStoredGithubSessionToken();
  const headers: Record<string, string> = {
    'X-Requested-With': 'SchemaForge',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers['x-github-session'] = token;
  }
  const res = await fetch(url, {
    ...init,
    credentials: 'include',
    headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      (data as { error?: string }).error ||
        `Request failed (${res.status})`
    ) as Error & { status?: number; code?: string };
    err.status = res.status;
    err.code = (data as { code?: string }).code;
    throw err;
  }
  return data as T;
}

export function fetchDbmlFromUrl(url: string): Promise<RemoteFetchResult> {
  return apiRequest<RemoteFetchResult>('/api/fetch-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}

export function getGithubAuthStatus(): Promise<GithubAuthStatus> {
  return apiRequest<GithubAuthStatus>('/api/auth/github/status');
}

export function getGithubAuthUrl(): Promise<{ url: string }> {
  return apiRequest<{ url: string }>('/api/auth/github/url');
}

export async function logoutGithub(): Promise<void> {
  setStoredGithubSessionToken(null);
  await apiRequest<{ ok: boolean }>('/api/auth/github/logout', {
    method: 'POST',
  });
  notifyAuthChanged();
}

export interface GithubInitBranchResult {
  branch: string;
  initialized: boolean;
  alreadyExists?: boolean;
  commitSha?: string;
  commitUrl?: string;
}

export function initGithubBranch(
  owner: string,
  repo: string,
  branch = 'main'
): Promise<GithubInitBranchResult> {
  return apiRequest<GithubInitBranchResult>('/api/github/init-branch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ owner, repo, branch }),
  });
}

export function getGithubRepoInfo(
  owner: string,
  repo: string
): Promise<GithubRepoInfo> {
  const qs = new URLSearchParams({ owner, repo });
  return apiRequest<GithubRepoInfo>(`/api/github/repo-info?${qs.toString()}`);
}

export function getGithubTree(
  owner: string,
  repo: string,
  branch: string
): Promise<{ files: GithubTreeFile[]; truncated: boolean; isEmpty?: boolean }> {
  const qs = new URLSearchParams({ owner, repo, branch });
  return apiRequest<{ files: GithubTreeFile[]; truncated: boolean; isEmpty?: boolean }>(
    `/api/github/tree?${qs.toString()}`
  );
}

export function getGithubFile(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<GithubFileResult> {
  const qs = new URLSearchParams({ owner, repo, path });
  if (ref) qs.set('ref', ref);
  return apiRequest<GithubFileResult>(`/api/github/file?${qs.toString()}`);
}

export interface GithubFolderResult {
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

export interface GithubBatchPushPayload {
  owner: string;
  repo: string;
  branch: string;
  message: string;
  files: Array<{
    path: string;
    content: string;
    expectedSha?: string;
  }>;
  createNewBranch?: boolean;
  newBranchName?: string;
  forceWithLatestSha?: boolean;
}

export interface GithubBatchPushResult {
  branch: string;
  commitSha: string;
  commitUrl: string;
  files: Array<{
    path: string;
    sha: string;
    htmlUrl: string;
  }>;
}

export function getGithubFolderFiles(
  owner: string,
  repo: string,
  branch: string,
  folder: string
): Promise<GithubFolderResult> {
  const qs = new URLSearchParams({ owner, repo, branch, folder });
  return apiRequest<GithubFolderResult>(`/api/github/folder?${qs.toString()}`);
}

export function pushGithubBatch(
  payload: GithubBatchPushPayload
): Promise<GithubBatchPushResult> {
  return apiRequest<GithubBatchPushResult>('/api/github/push-batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function pushGithubFile(
  payload: GithubPushPayload
): Promise<GithubPushResult> {
  return apiRequest<GithubPushResult>('/api/github/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function parseGithubTargetInput(raw: string): {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
} | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Match "owner/repo"
  const shortMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }

  try {
    const u = new URL(trimmed);
    const parts = u.pathname.split('/').filter(Boolean);
    if (
      (u.hostname === 'github.com' || u.hostname === 'www.github.com') &&
      parts.length >= 2
    ) {
      const owner = parts[0];
      const repo = parts[1].replace(/\.git$/, '');
      if (parts.length >= 5 && (parts[2] === 'blob' || parts[2] === 'tree' || parts[2] === 'raw')) {
        const branch = decodeURIComponent(parts[3]);
        const path = decodeURIComponent(parts.slice(4).join('/'));
        return { owner, repo, branch, path: parts[2] === 'tree' ? undefined : path };
      }
      return { owner, repo };
    }
    if (u.hostname === 'raw.githubusercontent.com' && parts.length >= 4) {
      return {
        owner: parts[0],
        repo: parts[1],
        branch: decodeURIComponent(parts[2]),
        path: decodeURIComponent(parts.slice(3).join('/')),
      };
    }
  } catch {
    return null;
  }
  return null;
}
