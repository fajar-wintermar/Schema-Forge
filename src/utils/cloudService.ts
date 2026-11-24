import {
  CloudAuthStatusResponse,
  SharedWorkspacePayload,
  ShareLinkRecord,
  WorkspaceProject,
} from '../types/schema';
import {
  apiClient,
  notifyAuthChanged,
  parseErrorResponse,
  publicApiClient,
  setStoredGithubSessionToken,
} from './apiClient';
import { getGithubAuthUrl, logoutGithub } from './remoteService';

export async function getCloudAuthStatus(
  signal?: AbortSignal
): Promise<CloudAuthStatusResponse> {
  const res = await apiClient.api.auth.me.$get(
    undefined,
    signal ? { init: { signal } } : undefined
  );
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function listCloudWorkspaces(
  signal?: AbortSignal
): Promise<{
  workspaces: WorkspaceProject[];
}> {
  const res = await apiClient.api.workspaces.$get(
    undefined,
    signal ? { init: { signal } } : undefined
  );
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function saveCloudWorkspace(
  workspace: WorkspaceProject
): Promise<{ ok: boolean; revision: number; syncedAt: string }> {
  const res = await apiClient.api.workspaces[':id'].$put({
    param: { id: encodeURIComponent(workspace.id) },
    json: workspace,
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function deleteCloudWorkspace(
  id: string
): Promise<{ ok: boolean }> {
  const res = await apiClient.api.workspaces[':id'].$delete({
    param: { id: encodeURIComponent(id) },
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function listWorkspaceShares(
  workspaceId: string,
  signal?: AbortSignal
): Promise<{ shares: ShareLinkRecord[] }> {
  const res = await apiClient.api.workspaces[':id'].shares.$get(
    { param: { id: encodeURIComponent(workspaceId) } },
    signal ? { init: { signal } } : undefined
  );
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function createWorkspaceShare(
  workspaceId: string,
  payload: {
    label?: string;
    pinnedVersionTag?: string | null;
    defaultView?: 'docs' | 'diagram';
    allowDiagramExport?: boolean;
    expiresInDays?: number | null;
    expiresAt?: string | null;
  }
): Promise<{ share: ShareLinkRecord }> {
  const res = await apiClient.api.workspaces[':id'].shares.$post({
    param: { id: encodeURIComponent(workspaceId) },
    json: payload,
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function updateWorkspaceShare(
  workspaceId: string,
  shareId: string,
  payload: {
    label?: string;
    pinnedVersionTag?: string | null;
    defaultView?: 'docs' | 'diagram';
    allowDiagramExport?: boolean;
    expiresInDays?: number | null;
    expiresAt?: string | null;
  }
): Promise<{ share: ShareLinkRecord }> {
  const res = await apiClient.api.workspaces[':id'].shares[':shareId'].$patch({
    param: {
      id: encodeURIComponent(workspaceId),
      shareId: encodeURIComponent(shareId),
    },
    json: payload,
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function revokeWorkspaceShare(
  workspaceId: string,
  shareId: string
): Promise<{ ok: boolean; revokedAt: string }> {
  const res = await apiClient.api.workspaces[':id'].shares[':shareId'].$delete({
    param: {
      id: encodeURIComponent(workspaceId),
      shareId: encodeURIComponent(shareId),
    },
  });
  if (!res.ok) {
    throw await parseErrorResponse(res);
  }
  return await res.json();
}

export async function fetchPublicShare(
  token: string,
  versionTag?: string | null,
  signal?: AbortSignal
): Promise<SharedWorkspacePayload> {
  const reqOptions = signal ? { init: { signal } } : undefined;
  const res = versionTag
    ? await publicApiClient.api.share[':token'][':versionTag'].$get(
        {
          param: {
            token: encodeURIComponent(token),
            versionTag: encodeURIComponent(versionTag),
          },
        },
        reqOptions
      )
    : await publicApiClient.api.share[':token'].$get(
        {
          param: { token: encodeURIComponent(token) },
        },
        reqOptions
      );

  if (!res.ok) {
    throw await parseErrorResponse(res, 'Unable to load shared schema');
  }
  return await res.json();
}

export function buildShareUrl(
  token: string,
  pinnedVersionTag?: string | null
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const suffix = pinnedVersionTag
    ? `/${encodeURIComponent(pinnedVersionTag)}`
    : '';
  return `${origin}/share/${encodeURIComponent(token)}${suffix}`;
}

export async function connectWithGithubOAuth(): Promise<void> {
  const { url } = await getGithubAuthUrl();
  await new Promise<void>((resolve, reject) => {
    const popup = window.open(
      url,
      'schemaforge_github_oauth',
      'width=620,height=720'
    );
    if (!popup) {
      reject(
        new Error(
          'Popup was blocked. Please allow popups for this site and try again.'
        )
      );
      return;
    }

    let settled = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.clearInterval(pollTimer);
      window.clearTimeout(timeoutTimer);
    };

    const onMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (
        origin !== window.location.origin &&
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost')
      ) {
        return;
      }
      if (!event.data || typeof event.data !== 'object') return;
      const msgType = Reflect.get(event.data, 'type');
      const provider = Reflect.get(event.data, 'provider');

      if (msgType === 'OAUTH_AUTH_SUCCESS' && provider === 'github') {
        settled = true;
        cleanup();
        const sessionToken = Reflect.get(event.data, 'sessionToken');
        if (typeof sessionToken === 'string') {
          setStoredGithubSessionToken(sessionToken);
        } else {
          notifyAuthChanged();
        }
        resolve();
      } else if (msgType === 'OAUTH_AUTH_ERROR' && provider === 'github') {
        settled = true;
        cleanup();
        const errText = Reflect.get(event.data, 'error');
        reject(
          new Error(
            typeof errText === 'string' && errText
              ? errText
              : 'GitHub sign-in failed.'
          )
        );
      }
    };

    const pollTimer = window.setInterval(() => {
      if (popup.closed && !settled) {
        settled = true;
        cleanup();
        notifyAuthChanged();
        resolve();
      }
    }, 450);

    const timeoutTimer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error('GitHub sign-in timed out.'));
      }
    }, 180000);

    window.addEventListener('message', onMessage);
  });
}

export async function signOutCloud(): Promise<void> {
  await logoutGithub();
}
