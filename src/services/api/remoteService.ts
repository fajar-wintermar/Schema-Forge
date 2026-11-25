import type { InferResponseType } from 'hono/client';
import {
  apiClient,
  AUTH_CHANGED_EVENT,
  getStoredGithubSessionToken,
  notifyAuthChanged,
  parseErrorResponse,
  setStoredGithubSessionToken,
} from './apiClient';

export {
  AUTH_CHANGED_EVENT,
  getStoredGithubSessionToken,
  notifyAuthChanged,
  setStoredGithubSessionToken,
};

export type RemoteFetchResult = InferResponseType<
  (typeof apiClient.api)['fetch-url']['$post'],
  200
>;

export type GithubAuthStatus = InferResponseType<
  typeof apiClient.api.auth.github.status.$get,
  200
>;

export type GithubUser = NonNullable<GithubAuthStatus['user']>;

export type GithubRepoInfo = InferResponseType<
  (typeof apiClient.api.github)['repo-info']['$get'],
  200
>;

export type GithubTreeResponse = InferResponseType<
  typeof apiClient.api.github.tree.$get,
  200
>;

export type GithubTreeFile = GithubTreeResponse['files'][number];

export type GithubFileResult = InferResponseType<
  typeof apiClient.api.github.file.$get,
  200
>;

export type GithubInitBranchResult = InferResponseType<
  (typeof apiClient.api.github)['init-branch']['$post'],
  200
>;

export type GithubFolderResult = InferResponseType<
  typeof apiClient.api.github.folder.$get,
  200
>;

export type GithubCommitInfo = InferResponseType<
  typeof apiClient.api.github.commits.$get,
  200
>['commits'][number];

export type GithubPushResult = InferResponseType<
  typeof apiClient.api.github.push.$post,
  200
>;

export type GithubBatchPushResult = InferResponseType<
  (typeof apiClient.api.github)['push-batch']['$post'],
  200
>;

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

export async function fetchDbmlFromUrl(
  url: string,
  signal?: AbortSignal
): Promise<RemoteFetchResult> {
  const res = await apiClient.api['fetch-url'].$post(
    { json: { url } },
    signal ? { init: { signal } } : undefined
  );
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function getGithubAuthStatus(
  signal?: AbortSignal
): Promise<GithubAuthStatus> {
  const res = await apiClient.api.auth.github.status.$get(
    undefined,
    signal ? { init: { signal } } : undefined
  );
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function getGithubAuthUrl(
  signal?: AbortSignal
): Promise<{ url: string }> {
  const res = await apiClient.api.auth.github.url.$get(
    undefined,
    signal ? { init: { signal } } : undefined
  );
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function logoutGithub(): Promise<void> {
  setStoredGithubSessionToken(null);
  const res = await apiClient.api.auth.github.logout.$post();
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  notifyAuthChanged();
}

export async function initGithubBranch(
  owner: string,
  repo: string,
  branch = 'main'
): Promise<GithubInitBranchResult> {
  const res = await apiClient.api.github['init-branch'].$post({
    json: { owner, repo, branch },
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function getGithubRepoInfo(
  owner: string,
  repo: string,
  signal?: AbortSignal
): Promise<GithubRepoInfo> {
  const res = await apiClient.api.github['repo-info'].$get(
    { query: { owner, repo } },
    signal ? { init: { signal } } : undefined
  );
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function getGithubTree(
  owner: string,
  repo: string,
  branch: string,
  signal?: AbortSignal
): Promise<GithubTreeResponse> {
  const res = await apiClient.api.github.tree.$get(
    { query: { owner, repo, branch } },
    signal ? { init: { signal } } : undefined
  );
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function getGithubFile(
  owner: string,
  repo: string,
  path: string,
  ref?: string,
  signal?: AbortSignal
): Promise<GithubFileResult> {
  const res = await apiClient.api.github.file.$get(
    { query: { owner, repo, path, ref } },
    signal ? { init: { signal } } : undefined
  );
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function getGithubCommits(params: {
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
  perPage?: number;
  signal?: AbortSignal;
}): Promise<{ commits: GithubCommitInfo[] }> {
  const res = await apiClient.api.github.commits.$get(
    {
      query: {
        owner: params.owner,
        repo: params.repo,
        branch: params.branch,
        path: params.path,
        per_page: params.perPage ? String(params.perPage) : undefined,
      },
    },
    params.signal ? { init: { signal: params.signal } } : undefined
  );
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function getGithubFolderFiles(
  owner: string,
  repo: string,
  branch: string,
  folder: string,
  signal?: AbortSignal
): Promise<GithubFolderResult> {
  const res = await apiClient.api.github.folder.$get(
    { query: { owner, repo, branch, folder } },
    signal ? { init: { signal } } : undefined
  );
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function pushGithubBatch(
  payload: GithubBatchPushPayload
): Promise<GithubBatchPushResult> {
  const res = await apiClient.api.github['push-batch'].$post({
    json: payload,
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function pushGithubFile(
  payload: GithubPushPayload
): Promise<GithubPushResult> {
  const res = await apiClient.api.github.push.$post({
    json: payload,
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}
