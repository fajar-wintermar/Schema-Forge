import type { GithubUserSummary } from '../../../domain/entities/types';
import { getAppUrl } from '../security/httpSecurity';
import type { ApiContext } from '../types';

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

export function renderOAuthErrorHtml(c: ApiContext, msg: string): Response {
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

export function renderOAuthSuccessHtml(
  c: ApiContext,
  sessionToken: string,
  user: GithubUserSummary
): Response {
  const payloadJson = serializeJsonForInlineScript({
    type: 'OAUTH_AUTH_SUCCESS',
    provider: 'github',
    sessionToken,
    user,
  });
  const safeTargetOrigin = serializeJsonForInlineScript(getSafeTargetOrigin(c));

  return c.html(`<!doctype html>
<html>
  <body style="font-family:system-ui,sans-serif;padding:24px;color:#0f172a;">
    <p>Connected to GitHub as <strong>@${escapeHtml(user.login)}</strong>. Closing window...</p>
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
