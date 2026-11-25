import { getCookie } from 'hono/cookie';
import type {
  GithubSessionPayload,
  ServerConfig,
} from '../../../domain/entities/types';
import type { ITokenCipher } from '../../../domain/gateways/ITokenCipher';
import { isGithubSessionPayload } from '../../../domain/policies/typeGuards';
import { buildServerConfig } from '../../../infrastructure/config/serverEnv';
import { randomHex } from '../../../infrastructure/security/webCryptoTokenCipher';
import type { ApiContext } from '../types';

let ephemeralFallbackSecret: string | null = null;

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
  const configured = config.sessionSecret || config.githubClientSecret;
  if (configured) return configured;
  if (!ephemeralFallbackSecret) {
    const generated = randomHex(32);
    ephemeralFallbackSecret = generated;
    return generated;
  }
  return ephemeralFallbackSecret;
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
  return Boolean(
    c.req.header('x-github-session') || c.req.header('x-requested-with')
  );
}

export async function extractGithubSession(
  c: ApiContext,
  tokenCipher: ITokenCipher,
  secret: string
): Promise<GithubSessionPayload | null> {
  const headerToken = c.req.header('x-github-session');
  if (headerToken && headerToken.trim()) {
    const parsed = await tokenCipher.decrypt(
      headerToken.trim(),
      secret,
      isGithubSessionPayload
    );
    if (parsed && parsed.user.login) return parsed;
  }

  const cookieToken = getCookie(c, 'sf_gh_session');
  if (cookieToken) {
    const parsed = await tokenCipher.decrypt(
      cookieToken,
      secret,
      isGithubSessionPayload
    );
    if (parsed && parsed.user.login) return parsed;
  }

  return null;
}
