import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { executeCompleteGithubOAuth } from '../../../application/usecases/auth/completeGithubOAuth';
import {
  executeGetAuthMeStatus,
  executeGetGithubConnectionStatus,
} from '../../../application/usecases/auth/getAuthStatus';
import { executeStartGithubOAuth } from '../../../application/usecases/auth/startGithubOAuth';
import { createRequestContainer } from '../container';
import { zValidate } from '../middleware/validation';
import { verifyMutatingRequestOrigin } from '../security/httpSecurity';
import type { ApiContext, AppEnv } from '../types';
import {
  renderOAuthErrorHtml,
  renderOAuthSuccessHtml,
} from '../views/oauthPopupHtml';

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

  const result = await executeCompleteGithubOAuth(
    {
      config: container.config,
      sessionSecret: container.sessionSecret,
      callbackUrl: container.callbackUrl,
      tokenCipher: container.tokenCipher,
      oauthGateway: container.oauthGateway,
      userRepository: container.userRepository,
    },
    { code, state, oauthError }
  );

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

  return renderOAuthSuccessHtml(c, result.sessionToken, result.user);
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
    return c.json(result, 200);
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
  .post('/github/logout', (c) => {
    if (!verifyMutatingRequestOrigin(c)) {
      throw new ForbiddenError('Invalid request origin.');
    }
    deleteCookie(c, 'sf_gh_session', {
      secure: true,
      sameSite: 'None',
      partitioned: true,
      path: '/',
    });
    return c.json({ ok: true }, 200);
  });
