import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type { ApiContext, AppEnv } from '../types';
import {
  createGithubOAuthAuthorizeUrl,
  exchangeGithubOAuthCode,
  getAuthMeStatus,
  getGithubConnectionStatus,
} from '../services/authService';

function renderOAuthErrorHtml(c: ApiContext, msg: string) {
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

  const payloadJson = JSON.stringify({
    type: 'OAUTH_AUTH_SUCCESS',
    provider: 'github',
    sessionToken: result.sessionToken,
    user: result.user,
  });

  return c.html(`<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;padding:24px;color:#0f172a;">
    <p>Connected to GitHub as <strong>@${result.user.login.replace(/</g, '&lt;')}</strong>. Closing window...</p>
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
  .get('/github/callback', handleGithubCallback)
  .get('/github/callback/', handleGithubCallback)
  .post('/github/logout', (c) => {
    deleteCookie(c, 'sf_gh_session', {
      secure: true,
      sameSite: 'None',
      partitioned: true,
      path: '/',
    });
    return c.json({ ok: true }, 200);
  });
