import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type {
  ApiContext,
  AppEnv,
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
  randomHex,
} from '../lib/crypto';
import { githubApiFetch } from '../lib/githubClient';
import { resolveUserId, upsertCloudUser } from '../lib/dbHelpers';

export const authRoutes = new Hono<{ Bindings: AppEnv }>();

authRoutes.get('/api/auth/me', async (c) => {
  const session = await getGithubSession(c);
  const clientId = getEnv(c, 'GITHUB_CLIENT_ID');
  const clientSecret = getEnv(c, 'GITHUB_CLIENT_SECRET');
  const db = c.env?.DB;

  let userId: string | null = null;
  if (session) {
    userId = resolveUserId(session.user);
    if (db) {
      try {
        await upsertCloudUser(db, session.user);
      } catch {
        // Non-fatal: table may not exist yet if migrations have not been applied on Cloudflare D1
      }
    }
  }

  return c.json({
    cloudEnabled: Boolean(db),
    githubConfigured: Boolean(clientId && clientSecret),
    authenticated: Boolean(session),
    user: session ? { ...session.user, id: userId } : null,
    callbackUrl: getCallbackUrl(c),
  });
});

authRoutes.get('/api/auth/github/status', async (c) => {
  const session = await getGithubSession(c);
  const clientId = getEnv(c, 'GITHUB_CLIENT_ID');
  const clientSecret = getEnv(c, 'GITHUB_CLIENT_SECRET');
  return c.json({
    configured: Boolean(clientId && clientSecret),
    connected: Boolean(session),
    user: session?.user || null,
    callbackUrl: getCallbackUrl(c),
  });
});

authRoutes.get('/api/auth/github/url', async (c) => {
  const clientId = getEnv(c, 'GITHUB_CLIENT_ID');
  const clientSecret = getEnv(c, 'GITHUB_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    return c.json(
      {
        error:
          'GitHub OAuth is not configured on the server. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.',
        callbackUrl: getCallbackUrl(c),
      },
      400
    );
  }

  // Stateless encrypted state works seamlessly across Cloudflare Worker isolates
  const state = await encryptToken<OAuthStatePayload>(
    { nonce: randomHex(16), exp: Date.now() + 10 * 60 * 1000 },
    getSessionSecret(c)
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUrl(c),
    scope: 'repo',
    state,
  });

  return c.json({
    url: `https://github.com/login/oauth/authorize?${params.toString()}`,
  });
});

async function handleGithubCallback(c: ApiContext) {
  const code = c.req.query('code') || '';
  const state = c.req.query('state') || '';
  const oauthError =
    c.req.query('error_description') || c.req.query('error') || '';

  const sendErrorHtml = (msg: string) => {
    const safeMsg = JSON.stringify(msg);
    return c.html(
      `<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;padding:24px;color:#0f172a;">
    <h3>GitHub Authentication Failed</h3>
    <p>${msg.replace(/</g, '&lt;')}</p>
    <script>
      if (window.opener) {
        window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', provider: 'github', error: ${safeMsg} }, '*');
      }
    </script>
  </body>
</html>`,
      400
    );
  };

  if (oauthError) {
    return sendErrorHtml(oauthError);
  }

  const secret = getSessionSecret(c);
  const parsedState = state
    ? await decryptToken<OAuthStatePayload>(state, secret)
    : null;

  if (!code || !parsedState || parsedState.exp < Date.now()) {
    return sendErrorHtml(
      'Invalid or expired OAuth state. Please try connecting again.'
    );
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
          code,
          redirect_uri: getCallbackUrl(c),
        }),
      }
    );

    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenRes.ok || !tokenData.access_token) {
      return sendErrorHtml(
        tokenData.error_description ||
          tokenData.error ||
          'Failed to exchange authorization code with GitHub.'
      );
    }

    const userRes = await githubApiFetch('/user', tokenData.access_token);
    if (!userRes.ok) {
      return sendErrorHtml('Failed to fetch GitHub user profile.');
    }

    const userRaw = (await userRes.json()) as {
      id?: number;
      login: string;
      name: string | null;
      avatar_url: string;
      html_url: string;
    };

    const user: GithubUserSummary = {
      id: userRaw.id,
      login: userRaw.login,
      name: userRaw.name,
      avatar_url: userRaw.avatar_url,
      html_url: userRaw.html_url,
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
        accessToken: tokenData.access_token,
        user,
        iat: Date.now(),
      },
      secret
    );

    setCookie(c, 'sf_gh_session', sessionToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'None',
      partitioned: true,
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    const payloadJson = JSON.stringify({
      type: 'OAUTH_AUTH_SUCCESS',
      provider: 'github',
      sessionToken,
      user,
    });

    return c.html(`<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;padding:24px;color:#0f172a;">
    <p>Connected to GitHub as <strong>@${user.login.replace(/</g, '&lt;')}</strong>. Closing window...</p>
    <script>
      if (window.opener) {
        window.opener.postMessage(${payloadJson}, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
  </body>
</html>`);
  } catch (err) {
    return sendErrorHtml(
      err instanceof Error ? err.message : 'Unexpected OAuth callback error.'
    );
  }
}

authRoutes.get('/api/auth/github/callback', handleGithubCallback);
authRoutes.get('/api/auth/github/callback/', handleGithubCallback);

authRoutes.post('/api/auth/github/logout', (c) => {
  deleteCookie(c, 'sf_gh_session', {
    secure: true,
    sameSite: 'None',
    partitioned: true,
    path: '/',
  });
  return c.json({ ok: true });
});
