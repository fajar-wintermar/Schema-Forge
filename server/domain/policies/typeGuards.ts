import type {
  GithubSessionPayload,
  GithubUserSummary,
  OAuthStatePayload,
} from '../entities/types';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function readString(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const val = obj[key];
  return typeof val === 'string' ? val : undefined;
}

export function readBoolean(
  obj: Record<string, unknown>,
  key: string
): boolean | undefined {
  const val = obj[key];
  return typeof val === 'boolean' ? val : undefined;
}

export function readNumber(
  obj: Record<string, unknown>,
  key: string
): number | undefined {
  const val = obj[key];
  return typeof val === 'number' && Number.isFinite(val) ? val : undefined;
}

export function isOAuthStatePayload(value: unknown): value is OAuthStatePayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.nonce === 'string' &&
    typeof value.exp === 'number' &&
    Number.isFinite(value.exp)
  );
}

export function isGithubUserSummary(value: unknown): value is GithubUserSummary {
  if (!isRecord(value)) return false;
  return (
    typeof value.login === 'string' &&
    (value.id === undefined || typeof value.id === 'number') &&
    (value.name === null || typeof value.name === 'string') &&
    typeof value.avatar_url === 'string' &&
    typeof value.html_url === 'string'
  );
}

export function isGithubSessionPayload(
  value: unknown
): value is GithubSessionPayload {
  if (!isRecord(value)) return false;
  return (
    typeof value.accessToken === 'string' &&
    value.accessToken.length > 0 &&
    typeof value.iat === 'number' &&
    Number.isFinite(value.iat) &&
    (value.jti === undefined || typeof value.jti === 'string') &&
    isGithubUserSummary(value.user)
  );
}
