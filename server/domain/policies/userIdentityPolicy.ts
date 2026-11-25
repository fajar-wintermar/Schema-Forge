import type { GithubUserSummary } from '../entities/types';

export function resolveUserId(user: GithubUserSummary): string {
  if (typeof user.id === 'number' && Number.isFinite(user.id)) {
    return `gh_${user.id}`;
  }
  return `gh_login_${user.login.toLowerCase()}`;
}

export function sanitizeId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 100) return null;
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) return null;
  return trimmed;
}
