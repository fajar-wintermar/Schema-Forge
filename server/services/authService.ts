import type { CloudAuthStatusResponse, CloudUser } from '../../src/types/schema';
import type {
  ApiContext,
  GithubSessionPayload,
  GithubUserSummary,
  OAuthStatePayload,
} from '../types';
import {
  decryptToken,
  encryptToken,
  getCallbackUrl,
  getEnv,
  getGithubSession,
  getSessionSecret,
  isOAuthStatePayload,
  randomHex,
} from '../lib/crypto';
import { resolveUserId, upsertCloudUser } from '../lib/dbHelpers';
import { githubApiFetch } from '../lib/githubClient';
import { isRecord, readJsonUnknown, readNumber, readString } from '../lib/http';

export interface GithubStatusResult {
  configured: boolean;
  connected: boolean;
  user: GithubUserSummary | null;
  callbackUrl: string;
}

export type GithubAuthUrlResult =
  | { ok: true; url: string }
  | { ok: false; error: string; callbackUrl: string };

export type GithubCallbackResult =
  | { ok: true; sessionToken: string; user: GithubUserSummary }
  | { ok: false; error: string };

export async function getAuthMeStatus(
  c: ApiContext
): Promise<CloudAuthStatusResponse> {
  const session = await getGithubSession(c);
  const clientId = getEnv(c, 'GITHUB_CLIENT_ID');
  const clientSecret = getEnv(c, 'GITHUB_CLIENT_SECRET');
  const db = c.env?.DB;

  let user: CloudUser | null = null;
  if (session) {
    const userId = resolveUserId(session.user);
    if (db) {
      try {
        await upsertCloudUser(db, session.user);
      } catch {
        // Non-fatal: table may not exist yet if migrations have not been applied on Cloudflare D1
      }
    }
    user = {
      id: userId,
      login: session.user.login,
      name: session.user.name,
      avatar_url: session.user.avatar_url,
      html_url: session.user.html_url,
    };
  }

  return {
    cloudEnabled: Boolean(db),
    githubConfigured: Boolean(clientId && clientSecret),
    authenticated: Boolean(session),
    user,
    callbackUrl: getCallbackUrl(c),
  };
}

export async function getGithubConnectionStatus(
  c: ApiContext
): Promise<GithubStatusResult> {
  const session = await getGithubSession(c);
  const clientId = getEnv(c, 'GITHUB_CLIENT_ID');
  const clientSecret = getEnv(c, 'GITHUB_CLIENT_SECRET');
  return {
    configured: Boolean(clientId && clientSecret),
    connected: Boolean(session),
    user: session?.user ?? null,
    callbackUrl: getCallbackUrl(c),
  };
}

export async function createGithubOAuthAuthorizeUrl(
  c: ApiContext
): Promise<GithubAuthUrlResult> {
  const clientId = getEnv(c, 'GITHUB_CLIENT_ID');
  const clientSecret = getEnv(c, 'GITHUB_CLIENT_SECRET');
  const callbackUrl = getCallbackUrl(c);

  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error:
        'GitHub OAuth is not configured on the server. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.',
      callbackUrl,
    };
  }

  // Stateless encrypted state works seamlessly across Cloudflare Worker isolates
  const state = await encryptToken<OAuthStatePayload>(
    { nonce: randomHex(16), exp: Date.now() + 10 * 60 * 1000 },
    getSessionSecret(c)
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    scope: 'repo',
    state,
  });

  return {
    ok: true,
    url: `https://github.com/login/oauth/authorize?${params.toString()}`,
  };
}

export async function exchangeGithubOAuthCode(
  c: ApiContext,
  params: { code: string; state: string; oauthError: string }
): Promise<GithubCallbackResult> {
  if (params.oauthError) {
    return { ok: false, error: params.oauthError };
  }

  const secret = getSessionSecret(c);
  const parsedState = params.state
    ? await decryptToken(params.state, secret, isOAuthStatePayload)
    : null;

  if (!params.code || !parsedState || parsedState.exp < Date.now()) {
    return {
      ok: false,
      error: 'Invalid or expired OAuth state. Please try connecting again.',
    };
  }

  const clientId = getEnv(c, 'GITHUB_CLIENT_ID');
  const clientSecret = getEnv(c, 'GITHUB_CLIENT_SECRET');

  try {
    const tokenRes = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: params.code,
          redirect_uri: getCallbackUrl(c),
        }),
      }
    );

    const tokenJson = await readJsonUnknown(tokenRes);
    const tokenRecord = isRecord(tokenJson) ? tokenJson : {};
    const accessToken = readString(tokenRecord, 'access_token');

    if (!tokenRes.ok || !accessToken) {
      return {
        ok: false,
        error:
          readString(tokenRecord, 'error_description') ||
          readString(tokenRecord, 'error') ||
          'Failed to exchange authorization code with GitHub.',
      };
    }

    const userRes = await githubApiFetch('/user', accessToken);
    if (!userRes.ok) {
      return { ok: false, error: 'Failed to fetch GitHub user profile.' };
    }

    const userJson = await readJsonUnknown(userRes);
    if (!isRecord(userJson)) {
      return { ok: false, error: 'Invalid GitHub user profile response.' };
    }

    const login = readString(userJson, 'login');
    const avatarUrl = readString(userJson, 'avatar_url');
    const htmlUrl = readString(userJson, 'html_url');
    if (!login || !avatarUrl || !htmlUrl) {
      return { ok: false, error: 'Incomplete GitHub user profile response.' };
    }

    const rawName = userJson.name;
    const user: GithubUserSummary = {
      id: readNumber(userJson, 'id'),
      login,
      name: typeof rawName === 'string' ? rawName : null,
      avatar_url: avatarUrl,
      html_url: htmlUrl,
    };

    if (c.env?.DB) {
      try {
        await upsertCloudUser(c.env.DB, user);
      } catch {
        // Non-fatal if D1 migrations haven't run yet
      }
    }

    const sessionToken = await encryptToken<GithubSessionPayload>(
      {
        accessToken,
        user,
        iat: Date.now(),
      },
      secret
    );

    return { ok: true, sessionToken, user };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : 'Unexpected OAuth callback error.',
    };
  }
}
