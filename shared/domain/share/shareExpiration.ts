export const MAX_SHARE_EXPIRY_MS = 3650 * 24 * 60 * 60 * 1000;

export type ExpirationResolution =
  | { ok: true; provided: boolean; value: string | null }
  | { ok: false; error: string };

export function resolveShareExpirationInput(
  body: {
    expiresAt?: unknown;
    expiresInDays?: unknown;
  },
  nowMs: number = Date.now()
): ExpirationResolution {
  const hasExpiresAt = Object.prototype.hasOwnProperty.call(body, 'expiresAt');
  const hasExpiresInDays = Object.prototype.hasOwnProperty.call(
    body,
    'expiresInDays'
  );

  if (!hasExpiresAt && !hasExpiresInDays) {
    return { ok: true, provided: false, value: null };
  }

  if (body.expiresAt !== undefined) {
    if (body.expiresAt === null || body.expiresAt === '') {
      return { ok: true, provided: true, value: null };
    }
    if (typeof body.expiresAt !== 'string') {
      return { ok: false, error: 'Invalid expiration date.' };
    }
    const parsedMs = Date.parse(body.expiresAt.trim());
    if (!Number.isFinite(parsedMs)) {
      return { ok: false, error: 'Invalid expiration date.' };
    }
    if (parsedMs <= nowMs) {
      return { ok: false, error: 'Expiration date must be in the future.' };
    }
    if (parsedMs > nowMs + MAX_SHARE_EXPIRY_MS) {
      return {
        ok: false,
        error: 'Expiration date cannot be more than 10 years in the future.',
      };
    }
    return { ok: true, provided: true, value: new Date(parsedMs).toISOString() };
  }

  if (body.expiresInDays === null) {
    return { ok: true, provided: true, value: null };
  }

  if (
    typeof body.expiresInDays === 'number' &&
    Number.isFinite(body.expiresInDays) &&
    body.expiresInDays > 0 &&
    body.expiresInDays <= 3650
  ) {
    return {
      ok: true,
      provided: true,
      value: new Date(
        nowMs + body.expiresInDays * 24 * 60 * 60 * 1000
      ).toISOString(),
    };
  }

  return {
    ok: false,
    error: 'Expiration days must be between 1 and 3650.',
  };
}
