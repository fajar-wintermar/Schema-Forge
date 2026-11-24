import { hc } from 'hono/client';
import type { AppType } from '../../server/api';

const SESSION_STORAGE_KEY = 'sf_gh_session_token';
export const AUTH_CHANGED_EVENT = 'schemaforge:auth-changed';

export class ApiClientError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

export function getStoredGithubSessionToken(): string | null {
  try {
    return sessionStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

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

function getClientHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'SchemaForge',
  };
  const token = getStoredGithubSessionToken();
  if (token) {
    headers['x-github-session'] = token;
  }
  return headers;
}

export const apiClient = hc<AppType>('/', {
  init: {
    credentials: 'include',
  },
  headers: getClientHeaders,
});

export const publicApiClient = hc<AppType>('/');

export async function parseErrorResponse(
  res: Response,
  fallbackPrefix = 'Request failed'
): Promise<ApiClientError> {
  let message = `${fallbackPrefix} (${res.status})`;
  let code: string | undefined;

  try {
    const raw: unknown = await res.json();
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const maybeError = Reflect.get(raw, 'error');
      const maybeCode = Reflect.get(raw, 'code');
      if (typeof maybeError === 'string' && maybeError.trim()) {
        message = maybeError;
      }
      if (typeof maybeCode === 'string' && maybeCode.trim()) {
        code = maybeCode;
      }
    }
  } catch {
    // Response body is not JSON; preserve fallback message
  }

  return new ApiClientError(message, res.status, code);
}
