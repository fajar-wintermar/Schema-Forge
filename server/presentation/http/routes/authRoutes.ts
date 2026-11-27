import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { executeCompleteGithubOAuth } from '../../../application/usecases/auth/completeGithubOAuth';
import {
  executeGetAuthMeStatus,
  executeGetGithubConnectionStatus,
} from '../../../application/usecases/auth/getAuthStatus';
import {
  executeStartGithubOAuth,
  OAUTH_STATE_TTL_MS,
} from '../../../application/usecases/auth/startGithubOAuth';
import { createRequestContainer } from '../container';
import { zValidate } from '../middleware/validation';
import {
  getOAuthStateCookieOptions,
  getSessionCookieOptions,
  revokeGithubSession,
  SESSION_MAX_AGE_SECONDS,
  verifyMutatingRequestOrigin,
} from '../security/httpSecurity';
import type { ApiContext, AppEnv } from '../types';
import {
  renderOAuthErrorHtml,
  renderOAuthSuccessHtml,
} from '../views/oauthPopupHtml';

const OAUTH_STATE_COOKIE_NAME = 'sf_oauth_state';
const SESSION_COOKIE_NAME = 'sf_gh_session';

const githubCallbackQuerySchema = z.object({
  code: z.string().max(512).optional(),
  state: z.string().max(2048).optional(),
  error: z.string().max(500).optional(),
  error_description: z.string().max(500).optional(),
});

async function handleGithubCallback(
  c: ApiContext,
  query: z.infer<typeof githubCallbackQuerySchema>
) {
  const container = createRequestContainer(c);
  const code = query.code || '';
  const state = query.state || '';
  const oauthError = query.error_description || query.error || '';
  const cookieState = getCookie(c, OAUTH_STATE_COOKIE_NAME) || '';

  // Consume OAuth state cookie immediately so each state can only be used once
  deleteCookie(
    c,
    OAUTH_STATE_COOKIE_NAME,
    getOAuthStateCookieOptions(c, container.config)
  );

  const result = await executeCompleteGithubOAuth(
    {
      config: container.config,
      sessionSecret: container.sessionSecret,
      callbackUrl: container.callbackUrl,
      tokenCipher: container.tokenCipher,
      oauthGateway: container.oauthGateway,
      userRepository: container.userRepository,
    },
    { code, state, cookieState, oauthError }
  );

  if (!result.ok) {
    return renderOAuthErrorHtml(c, result.error);
  }

  setCookie(c, SESSION_COOKIE_NAME, result.sessionToken, {
    ...getSessionCookieOptions(c, container.config),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return renderOAuthSuccessHtml(c, result.user);
}

export const authRoutes = new Hono<{ Bindings: AppEnv }>()
  .get('/me', async (c) => {
    const container = createRequestContainer(c);
    const session = await container.getSession();
    const status = await executeGetAuthMeStatus({
      config: container.config,
      userRepository: container.userRepository,
      session,
      callbackUrl: container.callbackUrl,
    });
    return c.json(status, 200);
  })
  .get('/github/status', async (c) => {
    const container = createRequestContainer(c);
    const session = await container.getSession();
    const status = executeGetGithubConnectionStatus({
      config: container.config,
      session,
      callbackUrl: container.callbackUrl,
    });
    return c.json(status, 200);
  })
  .get('/github/url', async (c) => {
    const container = createRequestContainer(c);
    const result = await executeStartGithubOAuth({
      config: container.config,
      sessionSecret: container.sessionSecret,
      callbackUrl: container.callbackUrl,
      tokenCipher: container.tokenCipher,
      oauthGateway: container.oauthGateway,
    });

    setCookie(c, OAUTH_STATE_COOKIE_NAME, result.stateBindingToken, {
      ...getOAuthStateCookieOptions(c, container.config),
      maxAge: Math.floor(OAUTH_STATE_TTL_MS / 1000),
    });

    return c.json({ url: result.url }, 200);
  })
  .get(
    '/github/callback',
    zValidate('query', githubCallbackQuerySchema),
    async (c) => handleGithubCallback(c, c.req.valid('query'))
  )
  .get(
    '/github/callback/',
    zValidate('query', githubCallbackQuerySchema),
    async (c) => handleGithubCallback(c, c.req.valid('query'))
  )
  .post('/github/logout', async (c) => {
    if (!verifyMutatingRequestOrigin(c)) {
      throw new ForbiddenError('Invalid request origin.');
    }
    const container = createRequestContainer(c);
    await revokeGithubSession(c, container.tokenCipher, container.sessionSecret);
    deleteCookie(
      c,
      SESSION_COOKIE_NAME,
      getSessionCookieOptions(c, container.config)
    );
    return c.json({ ok: true }, 200);
  });
