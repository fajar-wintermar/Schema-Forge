import {
  CloudAuthStatusResponse,
  SharedWorkspacePayload,
  ShareLinkRecord,
  WorkspaceProject,
} from '../types/schema';
import {
  apiRequest,
  getGithubAuthUrl,
  logoutGithub,
  notifyAuthChanged,
  setStoredGithubSessionToken,
} from './remoteService';

export function getCloudAuthStatus(): Promise<CloudAuthStatusResponse> {
  return apiRequest<CloudAuthStatusResponse>('/api/auth/me');
}

export function listCloudWorkspaces(): Promise<{
  workspaces: WorkspaceProject[];
}> {
  return apiRequest<{ workspaces: WorkspaceProject[] }>('/api/workspaces');
}

export function saveCloudWorkspace(
  workspace: WorkspaceProject
): Promise<{ ok: boolean; revision: number; syncedAt: string }> {
  return apiRequest<{ ok: boolean; revision: number; syncedAt: string }>(
    `/api/workspaces/${encodeURIComponent(workspace.id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workspace),
    }
  );
}

export function deleteCloudWorkspace(id: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(
    `/api/workspaces/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    }
  );
}

export function listWorkspaceShares(
  workspaceId: string
): Promise<{ shares: ShareLinkRecord[] }> {
  return apiRequest<{ shares: ShareLinkRecord[] }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/shares`
  );
}

export function createWorkspaceShare(
  workspaceId: string,
  payload: {
    label?: string;
    pinnedVersionTag?: string | null;
    defaultView?: 'docs' | 'diagram';
    expiresInDays?: number | null;
  }
): Promise<{ share: ShareLinkRecord }> {
  return apiRequest<{ share: ShareLinkRecord }>(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/shares`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
}

export function revokeWorkspaceShare(
  workspaceId: string,
  shareId: string
): Promise<{ ok: boolean; revokedAt: string }> {
  return apiRequest<{ ok: boolean; revokedAt: string }>(
    `/api/workspaces/${encodeURIComponent(
      workspaceId
    )}/shares/${encodeURIComponent(shareId)}`,
    {
      method: 'DELETE',
    }
  );
}

export async function fetchPublicShare(
  token: string,
  versionTag?: string | null
): Promise<SharedWorkspacePayload> {
  const path = versionTag
    ? `/api/share/${encodeURIComponent(token)}/${encodeURIComponent(versionTag)}`
    : `/api/share/${encodeURIComponent(token)}`;
  const res = await fetch(path, { method: 'GET' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      (data as { error?: string }).error ||
        `Unable to load shared schema (${res.status})`
    ) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return data as SharedWorkspacePayload;
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
      if (
        event.data?.type === 'OAUTH_AUTH_SUCCESS' &&
        event.data?.provider === 'github'
      ) {
        settled = true;
        cleanup();
        if (typeof event.data.sessionToken === 'string') {
          setStoredGithubSessionToken(event.data.sessionToken);
        } else {
          notifyAuthChanged();
        }
        resolve();
      } else if (
        event.data?.type === 'OAUTH_AUTH_ERROR' &&
        event.data?.provider === 'github'
      ) {
        settled = true;
        cleanup();
        reject(new Error(event.data.error || 'GitHub sign-in failed.'));
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
