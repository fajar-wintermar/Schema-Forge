import { getCookie } from 'hono/cookie';
import { ServiceUnavailableError } from '../../../../shared/domain/errors';
import type {
  GithubSessionPayload,
  ServerConfig,
} from '../../../domain/entities/types';
import type { ITokenCipher } from '../../../domain/gateways/ITokenCipher';
import { isGithubSessionPayload } from '../../../domain/policies/typeGuards';
import { buildServerConfig } from '../../../infrastructure/config/serverEnv';
import { randomHex } from '../../../infrastructure/security/webCryptoTokenCipher';
import type { ApiContext } from '../types';

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const SESSION_MAX_AGE_MS = SESSION_MAX_AGE_SECONDS * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

let ephemeralFallbackSecret: string | null = null;

export function timingSafeEqualStrings(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  if (aBytes.length !== bBytes.length || aBytes.length === 0) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i];
  }
  return diff === 0;
}

export function getRequestServerConfig(c: ApiContext): ServerConfig {
  return buildServerConfig(c.env as Record<string, unknown> | undefined);
}

export function getAppUrl(c: ApiContext, config?: ServerConfig): string {
  const cfg = config ?? getRequestServerConfig(c);
  if (cfg.appUrl) return cfg.appUrl;
  return new URL(c.req.url).origin;
}

export function getCallbackUrl(c: ApiContext, config?: ServerConfig): string {
  return `${getAppUrl(c, config)}/api/auth/github/callback`;
}

export function getSessionSecret(config: ServerConfig): string {
  if (config.sessionSecret) {
    return config.sessionSecret;
  }
  if (config.nodeEnv === 'production') {
    throw new ServiceUnavailableError(
      'SESSION_SECRET is not configured on the server.'
    );
  }
  if (!ephemeralFallbackSecret) {
    ephemeralFallbackSecret = randomHex(32);
  }
  return ephemeralFallbackSecret;
}

export function shouldUseSecureCookies(
  c: ApiContext,
  config?: ServerConfig
): boolean {
  const forwardedProto = c.req
    .header('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim()
    .toLowerCase();
  if (forwardedProto === 'https') return true;
  if (c.req.url.toLowerCase().startsWith('https://')) return true;
  const appUrl = getAppUrl(c, config);
  return appUrl.toLowerCase().startsWith('https://');
}

export function getSessionCookieOptions(
  c: ApiContext,
  config?: ServerConfig
): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'None' | 'Lax';
  partitioned?: true;
  path: '/';
} {
  const isSecure = shouldUseSecureCookies(c, config);
  if (isSecure) {
    return {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      partitioned: true,
      path: '/',
    };
  }
  return {
    httpOnly: true,
    secure: false,
    sameSite: 'Lax',
    path: '/',
  };
}

export function getOAuthStateCookieOptions(
  c: ApiContext,
  config?: ServerConfig
): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'None' | 'Lax';
  path: '/api/auth/github';
} {
  const isSecure = shouldUseSecureCookies(c, config);
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'None' : 'Lax',
    path: '/api/auth/github',
  };
}

export function getAllowedOrigins(c: ApiContext): Set<string> {
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(c.req.url).origin);
  } catch {
    // Ignore malformed request URL
  }

  const forwardedProto =
    c.req.header('x-forwarded-proto')?.split(',')[0]?.trim() ||
    (() => {
      try {
        return new URL(c.req.url).protocol.replace(/:$/, '');
      } catch {
        return 'https';
      }
    })();
  const forwardedHost = c.req.header('x-forwarded-host')?.split(',')[0]?.trim();
  const hostHeader = c.req.header('host')?.trim();
  if (forwardedHost) {
    allowed.add(`${forwardedProto}://${forwardedHost}`);
  }
  if (hostHeader) {
    allowed.add(`${forwardedProto}://${hostHeader}`);
  }

  const config = getRequestServerConfig(c);
  if (config.appUrl) {
    try {
      allowed.add(new URL(config.appUrl).origin);
    } catch {
      // Ignore invalid APP_URL
    }
  }

  for (const originEntry of config.allowedOrigins) {
    if (!originEntry || originEntry === '*') continue;
    try {
      allowed.add(new URL(originEntry).origin);
    } catch {
      // Ignore invalid origin entry
    }
  }

  return allowed;
}

export function isAllowedCorsOrigin(origin: string, c: ApiContext): boolean {
  if (!origin) return false;
  try {
    const normalized = new URL(origin).origin;
    return getAllowedOrigins(c).has(normalized);
  } catch {
    return false;
  }
}

export function verifyMutatingRequestOrigin(c: ApiContext): boolean {
  const origin = c.req.header('origin');
  if (origin) {
    return isAllowedCorsOrigin(origin, c);
  }
  return Boolean(c.req.header('x-requested-with'));
}

export function isSessionTimestampValid(iat: number, now = Date.now()): boolean {
  if (!Number.isFinite(iat)) return false;
  if (iat > now + MAX_CLOCK_SKEW_MS) return false;
  if (now - iat > SESSION_MAX_AGE_MS) return false;
  return true;
}

export async function extractGithubSession(
  c: ApiContext,
  tokenCipher: ITokenCipher,
  secret: string
): Promise<GithubSessionPayload | null> {
  const cookieToken = getCookie(c, 'sf_gh_session');
  if (!cookieToken) {
    return null;
  }

  const parsed = await tokenCipher.decrypt(
    cookieToken,
    secret,
    isGithubSessionPayload
  );
  if (!parsed || !parsed.user.login) {
    return null;
  }

  const now = Date.now();
  if (!isSessionTimestampValid(parsed.iat, now)) {
    return null;
  }

  if (parsed.jti && c.env?.DB) {
    const revoked = await c.env.DB
      .prepare(
        `SELECT jti FROM revoked_sessions
         WHERE jti = ? AND expires_at > ?
         LIMIT 1`
      )
      .bind(parsed.jti, now)
      .first<{ jti: string }>();
    if (revoked) {
      return null;
    }
  }

  return parsed;
}

export async function revokeGithubSession(
  c: ApiContext,
  tokenCipher: ITokenCipher,
  secret: string
): Promise<void> {
  const db = c.env?.DB;
  if (!db) return;

  const cookieToken = getCookie(c, 'sf_gh_session');
  if (!cookieToken) return;

  const parsed = await tokenCipher.decrypt(
    cookieToken,
    secret,
    isGithubSessionPayload
  );
  if (!parsed?.jti) return;

  const now = Date.now();
  const expiresAt = parsed.iat + SESSION_MAX_AGE_MS;
  await db.batch([
    db
      .prepare(
        `INSERT OR REPLACE INTO revoked_sessions (jti, expires_at) VALUES (?, ?)`
      )
      .bind(parsed.jti, expiresAt),
    db.prepare(`DELETE FROM revoked_sessions WHERE expires_at <= ?`).bind(now),
  ]);
}
