import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './types';
import { isAllowedCorsOrigin } from './lib/crypto';
import { ensureMigrations } from './lib/migrator';
import { optionalSessionHeadersSchema, zValidate } from './lib/validation';
import { authRoutes } from './routes/auth';
import { fetchUrlRoutes } from './routes/fetchUrl';
import { githubRoutes } from './routes/github';
import { shareRoutes } from './routes/share';
import { workspaceRoutes } from './routes/workspaces';

export type { AppEnv } from './types';

export const routes = new Hono<{ Bindings: AppEnv }>()
  .use(
    '*',
    secureHeaders({
      xFrameOptions: false,
      crossOriginOpenerPolicy: 'same-origin-allow-popups',
      crossOriginResourcePolicy: 'same-site',
      xContentTypeOptions: 'nosniff',
      referrerPolicy: 'strict-origin-when-cross-origin',
      xPermittedCrossDomainPolicies: 'none',
    })
  )
  .use(
    '/api/*',
    cors({
      origin: (origin, c) => (isAllowedCorsOrigin(origin, c) ? origin : ''),
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'X-Requested-With', 'x-github-session'],
      credentials: true,
      maxAge: 600,
    })
  )
  .use('/api/*', zValidate('header', optionalSessionHeadersSchema))
  .use('/api/*', async (c, next) => {
    if (c.env?.DB && !c.req.path.startsWith('/api/fetch-url')) {
      await ensureMigrations(c.env.DB);
    }
    await next();
  })
  .route('/api/auth', authRoutes)
  .route('/api/fetch-url', fetchUrlRoutes)
  .route('/api/github', githubRoutes)
  .route('/api/workspaces', workspaceRoutes)
  .route('/api', shareRoutes)
  .notFound((c) => {
    return c.json({ error: 'API endpoint not found.' }, 404);
  })
  .onError((err, c) => {
    console.error('[API Unhandled Error]', {
      method: c.req.method,
      path: c.req.path,
      error: err instanceof Error ? err.stack || err.message : String(err),
    });

    if (err instanceof HTTPException) {
      const status = err.status;
      const safeMessage =
        status >= 500
          ? 'An internal server error occurred.'
          : err.message || 'Request failed.';
      return c.json({ error: safeMessage }, status);
    }

    return c.json({ error: 'An internal server error occurred.' }, 500);
  });

export const api = routes;
export type AppType = typeof routes;
