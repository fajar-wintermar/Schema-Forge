import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import type { AppEnv } from './types';
import { isAllowedCorsOrigin } from './lib/crypto';
import { ensureMigrations } from './lib/migrator';
import { apiRateLimiter, strictEndpointRateLimiter } from './lib/rateLimit';
import { optionalSessionHeadersSchema, zValidate } from './lib/validation';
import { authRoutes } from './routes/auth';
import { fetchUrlRoutes } from './routes/fetchUrl';
import { githubRoutes } from './routes/github';
import { shareRoutes } from './routes/share';
import { workspaceRoutes } from './routes/workspaces';

export type { AppEnv } from './types';

const SMALL_JSON_BODY_LIMIT = 256 * 1024; // 256 KB
const WORKSPACE_BODY_LIMIT = 10 * 1024 * 1024; // 10 MB

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
  .get('/healthz', async (c) => {
    const db = c.env?.DB;
    if (!db) {
      return c.json({ status: 'error', db: 'unavailable' }, 503);
    }
    try {
      const probe = await db.prepare('SELECT 1 AS ok').first<{ ok: number }>();
      if (!probe || probe.ok !== 1) {
        return c.json({ status: 'error', db: 'unavailable' }, 503);
      }
      return c.json({ status: 'ok', db: 'connected' }, 200);
    } catch (err) {
      console.error('[Healthz] Database connectivity check failed:', err);
      return c.json({ status: 'error', db: 'unavailable' }, 503);
    }
  })
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
  .use('/api/*', apiRateLimiter)
  .use('/api/fetch-url/*', strictEndpointRateLimiter)
  .use('/api/github/*', strictEndpointRateLimiter)
  .use('/api/auth/*', strictEndpointRateLimiter)
  .use('/api/ai/*', strictEndpointRateLimiter)
  .use('/api/gemini/*', strictEndpointRateLimiter)
  .use(
    '/api/fetch-url/*',
    bodyLimit({
      maxSize: SMALL_JSON_BODY_LIMIT,
      onError: (c) => c.json({ error: 'Request payload too large.' }, 413),
    })
  )
  .use(
    '/api/auth/*',
    bodyLimit({
      maxSize: SMALL_JSON_BODY_LIMIT,
      onError: (c) => c.json({ error: 'Request payload too large.' }, 413),
    })
  )
  .use(
    '/api/ai/*',
    bodyLimit({
      maxSize: SMALL_JSON_BODY_LIMIT,
      onError: (c) => c.json({ error: 'Request payload too large.' }, 413),
    })
  )
  .use(
    '/api/gemini/*',
    bodyLimit({
      maxSize: SMALL_JSON_BODY_LIMIT,
      onError: (c) => c.json({ error: 'Request payload too large.' }, 413),
    })
  )
  .use(
    '/api/*',
    bodyLimit({
      maxSize: WORKSPACE_BODY_LIMIT,
      onError: (c) => c.json({ error: 'Request payload too large.' }, 413),
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
