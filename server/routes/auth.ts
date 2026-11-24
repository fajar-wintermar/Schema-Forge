import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import type { ApiContext, AppEnv } from '../types';
import { getAppUrl, verifyMutatingRequestOrigin } from '../lib/crypto';
import { zValidate } from '../lib/validation';
import {
  createGithubOAuthAuthorizeUrl,
  exchangeGithubOAuthCode,
  getAuthMeStatus,
  getGithubConnectionStatus,
} from '../services/authService';

const githubCallbackQuerySchema = z.object({
  code: z.string().max(512).optional(),
  state: z.string().max(2048).optional(),
  error: z.string().max(500).optional(),
  error_description: z.string().max(500).optional(),
});

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function serializeJsonForInlineScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function getSafeTargetOrigin(c: ApiContext): string {
  try {
    return new URL(getAppUrl(c)).origin;
  } catch {
    return new URL(c.req.url).origin;
  }
}

function renderOAuthErrorHtml(c: ApiContext, msg: string) {
  const safePayload = serializeJsonForInlineScript({
    type: 'OAUTH_AUTH_ERROR',
    provider: 'github',
    error: msg,
  });
  const safeTargetOrigin = serializeJsonForInlineScript(getSafeTargetOrigin(c));

  return c.html(
    `<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;padding:24px;color:#0f172a;">
    <h3>GitHub Authentication Failed</h3>
    <p>${escapeHtml(msg)}</p>
    <script>
      if (window.opener) {
        window.opener.postMessage(${safePayload}, ${safeTargetOrigin});
      }
    </script>
  </body>
</html>`,
    400
  );
}

async function handleGithubCallback(c: ApiContext) {
  const code = c.req.query('code') || '';
  const state = c.req.query('state') || '';
  const oauthError =
    c.req.query('error_description') || c.req.query('error') || '';

  const result = await exchangeGithubOAuthCode(c, { code, state, oauthError });
  if (!result.ok) {
    return renderOAuthErrorHtml(c, result.error);
  }

  setCookie(c, 'sf_gh_session', result.sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'None',
    partitioned: true,
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  });

  const payloadJson = serializeJsonForInlineScript({
    type: 'OAUTH_AUTH_SUCCESS',
    provider: 'github',
    sessionToken: result.sessionToken,
    user: result.user,
  });
  const safeTargetOrigin = serializeJsonForInlineScript(getSafeTargetOrigin(c));

  return c.html(`<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;padding:24px;color:#0f172a;">
    <p>Connected to GitHub as <strong>@${escapeHtml(result.user.login)}</strong>. Closing window...</p>
    <script>
      if (window.opener) {
        window.opener.postMessage(${payloadJson}, ${safeTargetOrigin});
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
  </body>
</html>`);
}

export const authRoutes = new Hono<{ Bindings: AppEnv }>()
  .get('/me', async (c) => {
    const status = await getAuthMeStatus(c);
    return c.json(status, 200);
  })
  .get('/github/status', async (c) => {
    const status = await getGithubConnectionStatus(c);
    return c.json(status, 200);
  })
  .get('/github/url', async (c) => {
    const result = await createGithubOAuthAuthorizeUrl(c);
    if (!result.ok) {
      return c.json(
        { error: result.error, callbackUrl: result.callbackUrl },
        400
      );
    }
    return c.json({ url: result.url }, 200);
  })
  .get(
    '/github/callback',
    zValidate('query', githubCallbackQuerySchema),
    handleGithubCallback
  )
  .get(
    '/github/callback/',
    zValidate('query', githubCallbackQuerySchema),
    handleGithubCallback
  )
  .post('/github/logout', (c) => {
    if (!verifyMutatingRequestOrigin(c)) {
      return c.json({ error: 'Invalid request origin.' }, 403);
    }
      deleteCookie(c, 'sf_gh_session', {
        secure: true,
        sameSite: 'None',
        partitioned: true,
        path: '/',
      });
      return c.json({ ok: true }, 200);
    }
  );
